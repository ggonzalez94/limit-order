import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment, TaskArguments } from 'hardhat/types';
import { networkConfig } from '../common/helper-hardhat-config';
import { ILimitSwapper } from '../types/typechain';

task('create-order', 'Creates a limit order with the specified parameters')
  .addParam('contractAddress', 'Address of the limit swapper')
  .addOptionalParam('sourceToken', 'Address of the source token')
  .addOptionalParam('destinationToken', 'Address of the destination token')
  .addOptionalParam('receiver', 'Address of the receiver')
  .addOptionalParam('amountOfSourceToken', 'The amount of the source token to be swapped.')
  .addOptionalParam('amountOfDestinationToken', 'The amount of the destination token to be received.')
  .setAction(async (taskArgs: TaskArguments, hre: HardhatRuntimeEnvironment): Promise<void> => {
    console.log(taskArgs);
    let sourceToken: string,
      destinationToken: string,
      receiver: string,
      amountOfSourceToken: string,
      amountOfDestinationToken: string;

    const chainId = hre.network.config.chainId as number;

    sourceToken =
      taskArgs.sourceToken !== undefined ? taskArgs.sourceToken : networkConfig[chainId].allowedSourceTokens[0];
    destinationToken =
      taskArgs.destinationToken !== undefined
        ? taskArgs.destinationToken
        : networkConfig[chainId].allowedDestinationTokens[0];
    receiver = taskArgs.receiver !== undefined ? taskArgs.receiver : (await hre.ethers.getSigners())[0].address;
    amountOfSourceToken =
      taskArgs.amountOfSourceToken !== undefined ? taskArgs.amountOfSourceToken : hre.ethers.utils.parseUnits('100', 6);
    amountOfDestinationToken =
      taskArgs.amountOfDestinationToken !== undefined
        ? taskArgs.amountOfDestinationToken
        : hre.ethers.utils.parseEther('0.0625'); //at rate 1ETH = 1600USDC

    const limitSwapper = (await hre.ethers.getContractAt('LimitSwapper', taskArgs.contractAddress)) as ILimitSwapper;
    const tx = await limitSwapper.createLimitOrder(
      sourceToken,
      destinationToken,
      receiver,
      amountOfSourceToken,
      amountOfDestinationToken,
    );
    await tx.wait();

    const activeOrders = await limitSwapper.getActiveOrders();
    console.log(`Order created successfully. There are ${activeOrders.length} active orders`);
  });
