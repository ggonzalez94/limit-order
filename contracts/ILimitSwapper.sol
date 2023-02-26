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
    uint256 amountOfSourceToken; //amount of source tokens that you want to sell(in token units). For example: 5 USDC = 5000000 units
    uint256 amountOfDestinationToken; //amount of destination token that you want to get(in token units). For example: 1WETH = 1000000000000000000 units
}

interface ILimitSwapper {
    event OrderCreated(
        uint256 orderId,
        address sourceToken,
        address destinationToken,
        address maker,
        address receiver,
        uint256 amountOfSourceToken,
        uint256 amountOfDestinationToken
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
        uint256 amountOfDestinationToken
    ) external returns (uint256 orderId);

    function executeLimitOrder(uint256 orderId) external;

    function cancelLimitOrder(uint256 orderId) external;

    function getOrder(uint256 orderId) external view returns (Order memory);
}
