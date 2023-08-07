import { ethers } from 'hardhat';
import { DefenderRelaySigner, DefenderRelayProvider } from 'defender-relay-client/lib/ethers';

async function main() {
  // message taken from arbiscan following this tutorial: https://kbadm.etherscan.com/how-to-verify-address-ownership/
  const message =
    '[arbiscan.io 07/08/2023 13:59:19] I, hereby verify that I am the owner/creator of the address [0xb59BE49E1c194373717Ab1d8C183B747829dD28f]';
  const [signer] = await ethers.getSigners();
  console.log(`Signer address: ${signer.address}`);
  const signature = await signer.signMessage(message);
  console.log(`Message signed: ${signature}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
