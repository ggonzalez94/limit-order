// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./ILimitSwapper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract LimitSwapper is ILimitSwapper, Initializable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    uint24 public constant SLIPPAGE = 5; // 5%
    uint24 private constant FEE = 3000; //TODO: Get pool dinamically
    address public SWAP_ROUTER;
    ISwapRouter private _swapRouter;

    uint256 private _orderId;
    mapping(uint256 orderId => Order order) private _orders;
    mapping(address token => bool allowed) private _allowedSourceTokens;
    mapping(address token => bool allowed) private _allowedDestinationTokens;

    modifier orderExists(uint256 orderId) {
        if (_orders[orderId].maker == address(0)) {
            revert LimitSwapperOrderNotExists(orderId);
        }
        _;
    }

    // Checks that the caller of the function is the one who created the order
    modifier onlyMaker(uint256 orderId) {
        if (_orders[orderId].maker != msg.sender) {
            revert LimitSwapperOnlyMaker(orderId);
        }
        _;
    }

    modifier isActive(uint256 orderId) {
        if (_orders[orderId].status != Status.Active) {
            revert LimitSwapperOrderIsNotActive(orderId);
        }
        _;
    }

    function initialize(
        address[] memory allowedSourceTokens,
        address[] memory allowedDestionationTokens,
        address swapRouter
    ) public initializer {
        for (uint256 i = 0; i < allowedSourceTokens.length; i++) {
            _allowedSourceTokens[allowedSourceTokens[i]] = true;
        }
        for (uint256 i = 0; i < allowedDestionationTokens.length; i++) {
            _allowedDestinationTokens[allowedDestionationTokens[i]] = true;
        }
        SWAP_ROUTER = swapRouter;
        _swapRouter = ISwapRouter(swapRouter);
        _orderId = 0;
        __Ownable_init();
    }

    function createLimitOrder(
        address sourceToken,
        address destinationToken,
        address receiver,
        uint256 amountOfSourceToken,
        uint256 amountOfDestinationToken
    ) external returns (uint256 orderId) {
        // validate that we accept the source and destination tokens
        if (!_allowedSourceTokens[sourceToken]) {
            revert LimitSwapperInvalidSourceToken(sourceToken);
        }

        if (!_allowedDestinationTokens[destinationToken]) {
            revert LimitSwapperInvalidDestinationToken(destinationToken);
        }

        // validate that an order with the same id doesn't exist?

        // register the order
        uint256 currentOrderId = _orderId;
        _orders[currentOrderId] = Order(
            Status.Active,
            sourceToken,
            destinationToken,
            msg.sender,
            receiver,
            amountOfSourceToken,
            amountOfDestinationToken
        );

        // emit orderCreated event
        emit OrderCreated(
            currentOrderId,
            sourceToken,
            destinationToken,
            msg.sender,
            receiver,
            amountOfSourceToken,
            amountOfDestinationToken
        );

        // increment orderId counter
        orderId++;
        return currentOrderId;
    }

    function executeLimitOrder(uint256 orderId) external orderExists(orderId) isActive(orderId) returns (uint256) {
        // retrieve limit order
        Order memory order = _orders[orderId];
        ERC20 sourceToken = ERC20(order.sourceToken);
        // Transfer source token from the maker to this contract(previous approval must exist)
        bool success = sourceToken.transferFrom(order.maker, address(this), order.amountOfSourceToken);
        if (!success) {
            revert LimitSwapperERC20TransferFromFailed();
        }
        // Approve Uniswap router to spend tokens on our behalf
        success = sourceToken.increaseAllowance(SWAP_ROUTER, order.amountOfSourceToken);
        if (!success) {
            revert LimitSwapperERC20IncreaseAllowanceFailed();
        }

        // Execute Uniswap trade
        // We specify an amountOutMinimum so that it ensures that we are at least getting (100 - SLIPPAGE)% of tokens
        // This saves from anyone executing the function when the price is not correct - causing the receiver to incur losses
        // Or if the slippage in uniswap is too large
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: order.sourceToken,
            tokenOut: order.destinationToken,
            fee: FEE,
            recipient: order.receiver,
            deadline: block.timestamp + 300, //5min deadline
            amountIn: order.amountOfSourceToken,
            amountOutMinimum: order.amountOfDestinationToken - (order.amountOfDestinationToken / SLIPPAGE), // Ensures that the amount of destinationTokens is at le
            sqrtPriceLimitX96: 0
        });
        uint256 amountOut = _swapRouter.exactInputSingle(params);

        //Set the status of the order as Filled and emit an event
        _orders[orderId].status = Status.Filled;
        emit OrderFilled(
            orderId,
            order.sourceToken,
            order.destinationToken,
            order.maker,
            order.receiver,
            msg.sender,
            order.amountOfSourceToken,
            amountOut
        );

        return amountOut;
    }

    function cancelLimitOrder(uint256 orderId) external onlyMaker(orderId) {
        if (_orders[orderId].status == Status.Filled) {
            revert LimitSwapperOrderFilled(orderId);
        }

        _orders[orderId].status = Status.Canceled;
        emit OrderCanceled(orderId);
    }

    function addAllowedSourceToken(address token) external onlyOwner {
        if (!_allowedSourceTokens[token]) {
            _allowedSourceTokens[token] = true;
            emit SourceTokenAllowed(token);
        }
    }

    function addAllowedDestinationToken(address token) external onlyOwner {
        if (!_allowedDestinationTokens[token]) {
            _allowedDestinationTokens[token] = true;
            emit DestinationTokenAllowed(token);
        }
    }

    function removeAllowedSourceToken(address token) external onlyOwner {
        if (_allowedSourceTokens[token]) {
            _allowedSourceTokens[token] = false;
            emit SourceTokenRemoved(token);
        }
    }

    function removeAllowedDestinationToken(address token) external onlyOwner {
        if (_allowedDestinationTokens[token]) {
            _allowedDestinationTokens[token] = false;
            emit DestinationTokenRemoved(token);
        }
    }

    function isSourceTokenAllowed(address token) external view returns (bool) {
        return _allowedSourceTokens[token];
    }

    function isDestinationTokenAllowed(address token) external view returns (bool) {
        return _allowedDestinationTokens[token];
    }

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    function getActiveOrders() external view returns (Order[] memory) {
        uint activeCount = 0;
        for (uint i = 0; i < _orderId; i++) {
            if (_orders[i].status == Status.Active) {
                activeCount++;
            }
        }
        Order[] memory activeOrders = new Order[](activeCount);
        uint currentIndex = 0;
        for (uint i = 0; i < _orderId; i++) {
            if (_orders[i].status == Status.Active) {
                activeOrders[currentIndex] = _orders[i];
                currentIndex++;
            }
        }
        return activeOrders;
    }
}
