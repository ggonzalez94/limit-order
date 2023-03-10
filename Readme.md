# On Chain Limit Orders :chains:

Introducing LimitSwapper - a protocol that enables users to execute swaps on Uniswap through limit orders placed directly on the blockchain. With access to Uniswap's deep liquidity pool, users can enjoy the best available price with minimal slippage.

To use LimitSwapper, simply submit a limit order to the smart contract, specifying the desired token pair and threshold price. The protocol automatically monitors the market and executes the trade when the price is below the specified threshold. It's important to note that your funds are never held by the smart contract, as you only register your order for execution. Be sure to approve tokens to the LimitSwapper smart contract to avoid execution failures.

The off-chain infrastructure that will monitor the market and execute the trades is still a WIP :nerd_face:.

---
## Test :test_tube:
Smart Contract tests are located in the [test](./test/) directory. These tests are written in typescript and run on a local Hardhat network.
1. Install packages
```
$ yarn
```
2. Run test suite
```
$ yarn hardhat test
```

## Deploy :rocket:
To deploy the smart contracts you just need to run the deployment script and specify the right network.
1. Install packages
```
$ yarn
```
2. Setup environment variables
If you are going to deploy to a live network, such as goerli you need to setup some environment variables such as `GOERLI_RPC_URL`, `PRIVATE_KEY` and `ETHERSCAN_API_KEY`. You can do this by creating a `.env` file. Use the `.env.example` as a reference. 

3. Deploy
```
$ yarn hardhat run scripts/deploy.ts --network <yourNetwork>
```