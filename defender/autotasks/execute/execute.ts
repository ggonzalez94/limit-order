import { AutotaskEvent } from 'defender-autotask-utils';
import { ethers, BigNumber } from 'ethers';
import { DefenderRelaySigner, DefenderRelayProvider } from 'defender-relay-client/lib/ethers';
import { OrderStructOutput } from '../../../types/typechain/ILimitSwapper';
import { abi as LIMIT_SWAPPER_ABI } from '../../../artifacts/contracts/ILimitSwapper.sol/ILimitSwapper.json';

const STACK_NAME = 'LimitSwapper';
const SLIPPAGE = 5; // 5%

export async function handler(event: AutotaskEvent) {
  console.log('Starting autotask...');
  // Validate request
  if (event.secrets === undefined) {
    throw new Error('Secrets missing');
  }
  const provider = new DefenderRelayProvider(event as any);
  const signer = new DefenderRelaySigner(event as any, provider, { speed: 'fast' });
  const network = (await provider.detectNetwork()).name; //Verify what gets returned in arbitrum
  console.log(`Runing on network: ${network}`);
  const { secrets } = event;
  const limitSwaperAddress = secrets[`${network}${STACK_NAME}_limitSwapperAddress`];
  if (limitSwaperAddress === undefined) {
    throw new Error('limitSwapperAddress missing in secrets');
  }
  const limitSwapper = new ethers.Contract(limitSwaperAddress, LIMIT_SWAPPER_ABI, signer);

  // Get all active orders from the contract
  const activeOrders = (await limitSwapper.getActiveOrders()) as OrderStructOutput[];
  console.log(`Analizing ${activeOrders.length} orders`);

  for (let orderId = 0; orderId < activeOrders.length; orderId++) {
    const order = activeOrders[orderId];
    const minAllowedAmountOut = order.amountOfDestinationToken.mul(100 - SLIPPAGE).div(100);
    console.log(`For order ${orderId} we expect to get ${minAllowedAmountOut} of output tokens`);
    // see if order can be executed by simulating the tx - https://docs.ethers.org/v5/single-page/#/v5/api/contract/contract/-%23-contract-callStatic
    let expectedAmountOut;
    try {
      expectedAmountOut = (await limitSwapper.callStatic.executeLimitOrder(orderId)) as BigNumber;
    } catch (error) {
      console.log(`Simulation failed for order ${orderId} with error ${error}`);
      expectedAmountOut = ethers.BigNumber.from(0); // set value to 0 so that next if statement fails and does not try to execute the tx
    }

    console.log(`If we execute the swap we will get ~ ${expectedAmountOut}`);
    if (expectedAmountOut.gt(minAllowedAmountOut)) {
      // if we expect to get more from the swap than the minAllowedAmountOut
      console.log(`Executing swap for order ${orderId}`);
      try {
        const tx = await limitSwapper.executeLimitOrder(orderId);
        await tx.wait();
        console.log(`Transaction executed successfully for order ${orderId}`);
      } catch (error) {
        console.log(`Execution revert for order ${orderId} with error ${error}`);
      }
    } else {
      console.log(`Skipping order ${orderId} since we wouldn't get enough tokens`);
    }
  }
}
