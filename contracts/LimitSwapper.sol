// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./ILimitSwapper.sol";

contract LimitSwapper is ILimitSwapper {
    uint256 private _orderId = 0;
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

    constructor(address[] memory allowedSourceTokens, address[] memory allowedDestionationTokens) {
        for (uint256 i = 0; i < allowedSourceTokens.length; i++) {
            _allowedSourceTokens[allowedSourceTokens[i]] = true;
        }
        for (uint256 i = 0; i < allowedDestionationTokens.length; i++) {
            _allowedDestinationTokens[allowedDestionationTokens[i]] = true;
        }
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
            Status.Created,
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

    function executeLimitOrder(uint256 orderId) external {
        return;
    }

    function cancelLimitOrder(uint256 orderId) external onlyMaker(orderId) {
        if (_orders[orderId].status == Status.Filled) {
            revert LimitSwapperOrderFilled(orderId);
        }

        _orders[orderId].status = Status.Canceled;
        emit OrderCanceled(orderId);
    }

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    // function getActiveOrders() external view returns(Order memory) {
    //     return;
    // }
}
