import { ethers, upgrades, network } from 'hardhat';
import { developmentChains, networkConfig } from '../common/helper-hardhat-config';
import { verify } from '../common/verify';

async function main() {
  console.log('Initializing deployment....');
  const LimitSwapper = await ethers.getContractFactory('LimitSwapper');
  const { allowedSourceTokens, allowedDestinationTokens, swapRouter, blockConfirmations } =
    networkConfig[network.config.chainId!];
  const args = [allowedSourceTokens, allowedDestinationTokens, swapRouter];

  console.log('Deploying LimitSwapper...');
  const limitSwapper = await upgrades.deployProxy(LimitSwapper, args);
  await limitSwapper.deployTransaction.wait(blockConfirmations);
  console.log('LimitSwapper deployed to:', limitSwapper.address);

  if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
    console.log('Verifying contract...');
    await verify(limitSwapper.address, []);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
