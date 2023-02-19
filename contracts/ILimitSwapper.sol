// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

enum Status {
    Created,
    Filled,
    Canceled
}
struct Order {
    Status status;
    address sourceToken;
    address destinationToken;
    address maker; //the address that created the order
    address receiver; //tokens will be sent to this address after fulfilling the order
    uint256 amountOfSourceToken;
    uint256 price; //amount of destination token that you want to get per 1 unit of source token
}

interface ILimitSwapper {
    event OrderCreated(
        uint256 orderId,
        address sourceToken,
        address destinationToken,
        address maker,
        address receiver,
        uint256 amountOfSourceToken,
        uint256 price
    );

    event OrderCanceled(uint256 orderId);

    error LimitSwapperInvalidSourceToken(address token);
    error LimitSwapperInvalidDestinationToken(address token);
    error LimitSwapperOrderFilled(uint256 orderId);
    error LimitSwapperOrderNotExists(uint256 orderId);
    error LimitSwapperOnlyMaker(uint256 orderId);

    function createLimitOrder(
        address sourceToken,
        address destinationToken,
        address receiver,
        uint256 amountOfSourceToken,
        uint256 price
    ) external returns (uint256 orderId);

    function executeLimitOrder(uint256 orderId) external;

    function cancelLimitOrder(uint256 orderId) external;
}
