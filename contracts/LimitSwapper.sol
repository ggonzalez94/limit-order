// SPDX-License-Identifier: MIT  
pragma solidity ^0.8.18;

import "./ILimitSwapper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @author Gustavo Gonzalez
 * @title LimitSwapper
 * @notice This contract allows users to set limit orders on allowed token pairs.
 * Orders are then executed by an off-chain actor(or themselves) when the price for the output token is below their input.
 * The contract uses Uniswap V3's SwapRouter
 */
contract LimitSwapper is ILimitSwapper, Initializable, OwnableUpgradeable {
    uint24 public constant SLIPPAGE = 5; // 5%
    ISwapRouter private _swapRouter;
    uint24 private constant FEE = 500; // Use 0.05% pool fee which is available for USDC/WETH and USDT/WETH. Next version of the protocol might include the ability to pass dynamic pool fees.
    uint256 private _orderId;
    mapping(uint256 orderId => Order order) private _orders;
    mapping(address token => bool allowed) private _allowedSourceTokens;
    mapping(address token => bool allowed) private _allowedDestinationTokens;

    /// @dev This modifier checks whether an order with the given ID exists or not
    modifier orderExists(uint256 orderId) {
        if (_orders[orderId].maker == address(0)) {
            revert LimitSwapperOrderNotExists(orderId);
        }
        _;
    }

    /// @dev This modifier checks whether the caller of the function is the one who created the order
    modifier onlyMaker(uint256 orderId) {
        if (_orders[orderId].maker != msg.sender) {
            revert LimitSwapperOnlyMaker(orderId);
        }
        _;
    }

    /// @dev This modifier checks whether the order with the given ID is active or not
    modifier isActive(uint256 orderId) {
        if (_orders[orderId].status != Status.Active) {
            revert LimitSwapperOrderIsNotActive(orderId);
        }
        _;
    }

    /**
     * @notice Initializes the contract with the given allowed source and destination tokens, and the Swap Router address
     * @param allowedSourceTokens The array of source token addresses that are allowed for trading
     * @param allowedDestionationTokens The array of destination token addresses that are allowed for trading
     * @param swapRouter The address of the Uniswap V3 Swap Router contract
     */
    function initialize(
        address[] calldata allowedSourceTokens,
        address[] calldata allowedDestionationTokens,
        address swapRouter
    ) public initializer {
        for (uint256 i = 0; i < allowedSourceTokens.length; i++) {
            _allowedSourceTokens[allowedSourceTokens[i]] = true;
        }
        for (uint256 i = 0; i < allowedDestionationTokens.length; i++) {
            _allowedDestinationTokens[allowedDestionationTokens[i]] = true;
        }
        _swapRouter = ISwapRouter(swapRouter);
        _orderId = 0;
        __Ownable_init();
    }

    /**
     * @notice Creates a new limit order to swap a specified amount of source token for a specified amount of destination token.
     * @dev The source token must be an allowed source token.
     * The destination token must be an allowed destination token.
     * @param sourceToken The address of the source token to be swapped.
     * @param destinationToken The address of the destination token to be received.
     * @param receiver The address of the receiver of the destination token.
     * @param amountOfSourceToken The amount of the source token to be swapped.
     * @param amountOfDestinationToken The amount of the destination token to be received.
     * @return orderId The ID of the newly created order.
     */
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
        _orderId++;
        return currentOrderId;
    }

    /**
     * @notice Executes a limit order by transferring the source token from the maker to this contract,
     * approving the Uniswap router to spend tokens on the contract behalf, and then executing the Uniswap trade.
     * @dev The order must exist and be active. The amount of source token must be approved by the maker
     * to this contract beforehand. The function specifies an amountOutMinimum to ensure that at least
     * (100 - SLIPPAGE)% of tokens are received. If the execution fails, the order is reverted and an error
     * is emitted.
     * @param orderId The ID of the order to execute
     * @return The amount of destination token received from the trade
     */
    function executeLimitOrder(uint256 orderId) external orderExists(orderId) isActive(orderId) returns (uint256) {
        // retrieve limit order
        Order memory order = _orders[orderId];
        //Set the status of the order as Filled and emit an event
        _orders[orderId].status = Status.Filled;

        ERC20 sourceToken = ERC20(order.sourceToken);
        // Transfer source token from the maker to this contract(previous approval must exist)
        // slither-disable-next-line arbitrary-send-erc20
        bool success = sourceToken.transferFrom(order.maker, address(this), order.amountOfSourceToken);
        if (!success) {
            revert LimitSwapperERC20TransferFromFailed();
        }
        // Approve Uniswap router to spend tokens on our behalf
        success = sourceToken.increaseAllowance(address(_swapRouter), order.amountOfSourceToken);
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
            amountOutMinimum: (order.amountOfDestinationToken * (100 - SLIPPAGE)) / 100,
            sqrtPriceLimitX96: 0
        });
        uint256 amountOut = _swapRouter.exactInputSingle(params);

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

    /**
     * @notice Cancels a limit order created by the maker. If the order has already been filled, the function reverts
     * and emits an error. Otherwise, the status of the order is set to Canceled and an OrderCanceled event is emitted.
     * @dev Only the maker of the order can call this function.
     * @param orderId The ID of the order to cancel
     */
    function cancelLimitOrder(uint256 orderId) external onlyMaker(orderId) {
        if (_orders[orderId].status == Status.Filled) {
            revert LimitSwapperOrderFilled(orderId);
        }

        _orders[orderId].status = Status.Canceled;
        emit OrderCanceled(orderId);
    }

    /**
     * @notice Adds a new allowed source token to the list of allowed source tokens. If the token is already allowed,
     * the function does nothing.
     * @dev Only the contract owner can call this function.
     * @param token The address of the token to add as an allowed source token.
     */
    function addAllowedSourceToken(address token) external onlyOwner {
        if (!_allowedSourceTokens[token]) {
            _allowedSourceTokens[token] = true;
            emit SourceTokenAllowed(token);
        }
    }

    /**
     * @notice Adds a new allowed destination token to the list of allowed destination tokens. If the token is already allowed,
     * the function does nothing.
     * @dev Only the contract owner can call this function.
     * @param token The address of the token to add as an allowed destination token.
     */
    function addAllowedDestinationToken(address token) external onlyOwner {
        if (!_allowedDestinationTokens[token]) {
            _allowedDestinationTokens[token] = true;
            emit DestinationTokenAllowed(token);
        }
    }

    /**
     * @notice Removes an allowed source token from the list of allowed source tokens. If the token is not currently
     * allowed, the function does nothing.
     * @dev Only the contract owner can call this function.
     * @param token The address of the token to remove from the list of allowed source tokens.
     */
    function removeAllowedSourceToken(address token) external onlyOwner {
        if (_allowedSourceTokens[token]) {
            _allowedSourceTokens[token] = false;
            emit SourceTokenRemoved(token);
        }
    }

    /**
     * @notice Removes an allowed destination token from the list of allowed destination tokens. If the token is not currently
     * allowed, the function does nothing.
     * @dev Only the contract owner can call this function.
     * @param token The address of the token to remove from the list of allowed destination tokens.
     */
    function removeAllowedDestinationToken(address token) external onlyOwner {
        if (_allowedDestinationTokens[token]) {
            _allowedDestinationTokens[token] = false;
            emit DestinationTokenRemoved(token);
        }
    }

    /**
     * @notice Returns whether the specified token is an allowed source token.
     * @param token The address of the token to check.
     * @return Whether the token is an allowed source token.
     */
    function isSourceTokenAllowed(address token) external view returns (bool) {
        return _allowedSourceTokens[token];
    }

    /**
     * @notice Returns whether the specified token is an allowed destination token.
     * @param token The address of the token to check.
     * @return Whether the token is an allowed destination token.
     */
    function isDestinationTokenAllowed(address token) external view returns (bool) {
        return _allowedDestinationTokens[token];
    }

    /**
     * @notice Returns the limit order with the specified ID.
     * @param orderId The ID of the order to retrieve.
     * @return The order object.
     */
    function getOrder(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    /**
     * @notice Returns an array of all active orders (orders that have been created but not yet canceled or filled).
     * @dev The maker address has to be different than the zero address to make sure the order exists
     * and the order status has to be Active.
     * @return An array of active orders.
     *
     */
    function getActiveOrders() external view returns (Order[] memory) {
        uint activeCount = 0;
        for (uint i = 0; i <= _orderId; i++) {
            if (_orders[i].maker != address(0) && _orders[i].status == Status.Active) {
                activeCount++;
            }
        }
        Order[] memory activeOrders = new Order[](activeCount);
        uint currentIndex = 0;
        for (uint i = 0; i <= _orderId; i++) {
            if (_orders[i].maker != address(0) && _orders[i].status == Status.Active) {
                activeOrders[currentIndex] = _orders[i];
                currentIndex++;
            }
        }
        return activeOrders;
    }
}
