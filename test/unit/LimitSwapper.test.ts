import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { assert, expect } from 'chai';
import { ILimitSwapper } from '../../types/typechain';

const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const usdt = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

describe('LimitSwapper', function () {
  async function deployLimitSwapperFixture() {
    const LimitSwapper = await ethers.getContractFactory('LimitSwapper');
    const [signer1, signer2] = await ethers.getSigners();

    const limitSwapper = (await LimitSwapper.deploy([usdc], [weth])) as ILimitSwapper;
    await limitSwapper.deployed();

    return { limitSwapper, signer1, signer2 };
  }

  describe('Create Limit Order', function () {
    it('creates a limit order with the right maker', async () => {
      const { limitSwapper, signer1 } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      const tx = await limitSwapper.createLimitOrder(usdc, weth, signer1.address, inputAmount, 1600);
      const receipt = await tx.wait(1);
      const { maker } = receipt.events![0].args;
      console.log(maker);

      assert.equal(maker, signer1.address);
    });

    it('emits an OrderCreated event', async () => {
      const { limitSwapper, signer1 } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      await expect(limitSwapper.createLimitOrder(usdc, weth, signer1.address, inputAmount, 1600)).to.emit(
        limitSwapper,
        'OrderCreated',
      );
    });

    it('reverts if source token is not allowed', async () => {
      const { limitSwapper, signer1 } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      await expect(
        limitSwapper.createLimitOrder(usdt, weth, signer1.address, inputAmount, 1600),
      ).to.be.revertedWithCustomError(limitSwapper, 'LimitSwapperInvalidSourceToken');
    });

    it('reverts if destination token is not allowed', async () => {
      const { limitSwapper, signer1 } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      await expect(
        limitSwapper.createLimitOrder(usdc, usdt, signer1.address, inputAmount, 1600),
      ).to.be.revertedWithCustomError(limitSwapper, 'LimitSwapperInvalidDestinationToken');
    });
  });

  describe('Cancel Limit Order', function () {
    it('cancels a created order', async () => {
      const { limitSwapper, signer1 } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      let tx = await limitSwapper.createLimitOrder(usdc, weth, signer1.address, inputAmount, 1600);
      const receipt = await tx.wait(1);
      const { orderId } = receipt.events![0].args;

      tx = await limitSwapper.cancelLimitOrder(orderId);
      await tx.wait(1);

      const order = await limitSwapper.getOrder(orderId);
      assert.equal(order.status, 2);
    });

    it('reverts if other address but the maker tries to cancel', async () => {
      const { limitSwapper, signer1, signer2 } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      let tx = await limitSwapper.createLimitOrder(usdc, weth, signer1.address, inputAmount, 1600);
      const receipt = await tx.wait(1);
      const { orderId } = receipt.events![0].args;

      await expect(limitSwapper.connect(signer2).cancelLimitOrder(orderId)).to.be.revertedWithCustomError(
        limitSwapper,
        'LimitSwapperOnlyMaker',
      );
    });

    it('reverts if the order does not exists', async () => {
      const { limitSwapper, signer1 } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      await expect(limitSwapper.connect(signer1).cancelLimitOrder(55)).to.be.reverted;
    });
  });
});
