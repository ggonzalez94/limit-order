import { AutotaskEvent, BlockTriggerEvent } from 'defender-autotask-utils';
import { ethers, Signer } from 'ethers';
import { DefenderRelaySigner, DefenderRelayProvider } from 'defender-relay-client/lib/ethers';

const LIMIT_SWAPPER_ABI = ['function executeLimitOrder(uint256 orderId) external returns (uint256)'];
const STACK_NAME = 'LimitSwapper';

export async function handler(event: AutotaskEvent) {
  console.log('Starting autotask...');
  // Validate request
  if (event.request?.body === undefined) {
    throw new Error('Request missing');
  }
  if (event.secrets === undefined) {
    throw new Error('Secrets missing');
  }
  const payload = event.request.body as BlockTriggerEvent;
  const provider = new DefenderRelayProvider(event as any);
  const signer = new DefenderRelaySigner(event as any, provider, { speed: 'fast' });
  const network = await signer.getAddress();
  const { secrets } = event;
  const limitSwaperAddress = secrets[`${network}${STACK_NAME}_limitSwapperAddress`];
  if (limitSwaperAddress === undefined) {
    throw new Error('limitSwapperAddress missing in secrets');
  }
  // Iterate over the list of matched orders
  for (const orderId of payload.metadata!.orders as string[]) {
    await executeLimitOrder(signer, limitSwaperAddress, orderId); // Execute each limit order
  }
}
const executeLimitOrder = async (signer: Signer, address: string, orderId: string) => {
  const limitSwapper = new ethers.Contract(address, LIMIT_SWAPPER_ABI, signer);
  const tx = await limitSwapper.executeLimitOrder(orderId);
  await tx.wait();
};
