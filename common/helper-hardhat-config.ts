type NetworkConfigItem = {
  name: string;
  blockConfirmations: number;
  allowedSourceTokens: string[];
  allowedDestinationTokens: string[];
  swapRouter: string;
};

type NetworkConfigMap = {
  [chainId: string]: NetworkConfigItem;
};

export const networkConfig: NetworkConfigMap = {
  default: {
    name: 'hardhat',
    blockConfirmations: 1,
    allowedSourceTokens: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
    allowedDestinationTokens: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  31337: {
    name: 'localhost',
    blockConfirmations: 1,
    allowedSourceTokens: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
    allowedDestinationTokens: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  5: {
    name: 'goerli',
    blockConfirmations: 5,
    allowedSourceTokens: ['0x07865c6e87b9f70255377e024ace6630c1eaa37f'], //usdc
    allowedDestinationTokens: ['0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'], //weth
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  42161: {
    name: 'arbitrum',
    blockConfirmations: 5,
    allowedSourceTokens: ['0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'], //usdc
    allowedDestinationTokens: ['0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'], //weth
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
};

export const developmentChains = ['hardhat', 'localhost'];
