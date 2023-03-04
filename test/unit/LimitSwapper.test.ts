import { ethers, upgrades } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { assert, expect } from 'chai';
import { ILimitSwapper } from '../../types/typechain';
import * as ERC20 from '../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';
import * as ISwapRouter from '../../artifacts/@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol/ISwapRouter.json';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const ORDER_ACTIVE = 0;
const ORDER_FILLED = 1;
const ORDER_CANCELED = 2;

describe('LimitSwapper', function () {
  async function deployLimitSwapperFixture() {
    // deploy mocks
    const [signer1, signer2] = await ethers.getSigners();
    const mockUsdc = await deployMockContract(signer1, ERC20.abi);
    const mockWeth = await deployMockContract(signer1, ERC20.abi);
    const mockUsdt = await deployMockContract(signer1, ERC20.abi);
    const mockSwapRouter = await deployMockContract(signer1, ISwapRouter.abi);
    const LimitSwapper = await ethers.getContractFactory('LimitSwapper');

    const args = [[mockUsdc.address], [mockWeth.address], mockSwapRouter.address];
    const limitSwapper = (await upgrades.deployProxy(LimitSwapper, args)) as ILimitSwapper;
    await limitSwapper.deployed();

    return { limitSwapper, signer1, signer2, mockUsdc, mockUsdt, mockWeth, mockSwapRouter };
  }

  describe('Create Limit Order', function () {
    it('creates a limit order with the right maker', async () => {
      const { limitSwapper, signer1, mockUsdc, mockWeth } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      const tx = await limitSwapper.createLimitOrder(
        mockUsdc.address,
        mockWeth.address,
        signer1.address,
        inputAmount,
        1600,
      );
      const receipt = await tx.wait(1);
      const { maker } = receipt.events![0].args;

      assert.equal(maker, signer1.address);
    });

    it('emits an OrderCreated event', async () => {
      const { limitSwapper, signer1, mockUsdc, mockWeth } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      await expect(
        limitSwapper.createLimitOrder(mockUsdc.address, mockWeth.address, signer1.address, inputAmount, 1600),
      ).to.emit(limitSwapper, 'OrderCreated');
    });

    it('reverts if source token is not allowed', async () => {
      const { limitSwapper, signer1, mockUsdt, mockWeth } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      await expect(
        limitSwapper.createLimitOrder(mockUsdt.address, mockWeth.address, signer1.address, inputAmount, 1600),
      ).to.be.revertedWithCustomError(limitSwapper, 'LimitSwapperInvalidSourceToken');
    });

    it('reverts if destination token is not allowed', async () => {
      const { limitSwapper, signer1, mockUsdc, mockUsdt } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      await expect(
        limitSwapper.createLimitOrder(mockUsdc.address, mockUsdt.address, signer1.address, inputAmount, 1600),
      ).to.be.revertedWithCustomError(limitSwapper, 'LimitSwapperInvalidDestinationToken');
    });
  });

  describe('Cancel Limit Order', function () {
    it('cancels a created order', async () => {
      const { limitSwapper, signer1, mockUsdc, mockWeth } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      let tx = await limitSwapper.createLimitOrder(
        mockUsdc.address,
        mockWeth.address,
        signer1.address,
        inputAmount,
        1600,
      );
      const receipt = await tx.wait(1);
      const { orderId } = receipt.events![0].args;

      tx = await limitSwapper.cancelLimitOrder(orderId);
      await tx.wait(1);

      const order = await limitSwapper.getOrder(orderId);
      assert.equal(order.status, ORDER_CANCELED);
    });

    it('reverts if other address but the maker tries to cancel', async () => {
      const { limitSwapper, signer1, signer2, mockUsdc, mockWeth } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);

      let tx = await limitSwapper.createLimitOrder(
        mockUsdc.address,
        mockWeth.address,
        signer1.address,
        inputAmount,
        1600,
      );
      const receipt = await tx.wait(1);
      const { orderId } = receipt.events![0].args;

      await expect(limitSwapper.connect(signer2).cancelLimitOrder(orderId)).to.be.revertedWithCustomError(
        limitSwapper,
        'LimitSwapperOnlyMaker',
      );
    });

    it('reverts if the order does not exists', async () => {
      const { limitSwapper } = await loadFixture(deployLimitSwapperFixture);

      await expect(limitSwapper.cancelLimitOrder(55)).to.be.reverted;
    });
  });

  describe('Execute Limit Order', function () {
    it('reverts if order does not exists', async () => {
      const { limitSwapper } = await loadFixture(deployLimitSwapperFixture);
      const orderId = 10; //order id that does not exist
      await expect(limitSwapper.executeLimitOrder(orderId)).to.be.revertedWithCustomError(
        limitSwapper,
        'LimitSwapperOrderNotExists',
      );
    });
    it('reverts if the order is filled', async () => {
      const { limitSwapper, signer1, mockUsdc, mockWeth, mockSwapRouter } = await loadFixture(
        deployLimitSwapperFixture,
      );
      const inputAmount = ethers.utils.parseUnits('100', 6);
      const outputAmount = ethers.utils.parseEther('0.0625'); //at rate 1ETH = 1600USDC
      const orderId = await createOrder(
        mockUsdc.address,
        mockWeth.address,
        signer1.address,
        inputAmount,
        outputAmount,
        limitSwapper,
        signer1,
      );

      console.log(`Address of usdc mock: ${mockUsdc.address}`);
      //setup mocks
      await mockUsdc.mock.transferFrom.returns(true);
      await mockUsdc.mock.increaseAllowance.returns(true);
      await mockSwapRouter.mock.exactInputSingle.returns(outputAmount);

      //fill order
      const tx = await limitSwapper.executeLimitOrder(orderId);
      await tx.wait(1);

      //try to execute it again, it should revert
      await expect(limitSwapper.executeLimitOrder(orderId)).to.be.revertedWithCustomError(
        limitSwapper,
        'LimitSwapperOrderIsNotActive',
      );
    });
    it('reverts if the order is canceled', async () => {
      const { limitSwapper, signer1, mockUsdc, mockWeth } = await loadFixture(deployLimitSwapperFixture);
      const inputAmount = ethers.utils.parseUnits('100', 6);
      const outputAmount = ethers.utils.parseEther('0.0625'); //at rate 1ETH = 1600USDC
      const orderId = await createOrder(
        mockUsdc.address,
        mockWeth.address,
        signer1.address,
        inputAmount,
        outputAmount,
        limitSwapper,
        signer1,
      );

      const tx = await limitSwapper.cancelLimitOrder(orderId);
      await tx.wait(1);

      await expect(limitSwapper.executeLimitOrder(orderId)).to.be.revertedWithCustomError(
        limitSwapper,
        'LimitSwapperOrderIsNotActive',
      );
    });
    it('updates the state if order was executed successfully', async () => {
      const { limitSwapper, signer1, mockUsdc, mockWeth, mockSwapRouter } = await loadFixture(
        deployLimitSwapperFixture,
      );
      const inputAmount = ethers.utils.parseUnits('100', 6);
      const outputAmount = ethers.utils.parseEther('0.0625'); //at rate 1ETH = 1600USDC
      const orderId = await createOrder(
        mockUsdc.address,
        mockWeth.address,
        signer1.address,
        inputAmount,
        outputAmount,
        limitSwapper,
        signer1,
      );

      console.log(`Address of usdc mock: ${mockUsdc.address}`);
      //setup mocks
      await mockUsdc.mock.transferFrom.returns(true);
      await mockUsdc.mock.increaseAllowance.returns(true);
      await mockSwapRouter.mock.exactInputSingle.returns(outputAmount);

      const tx = await limitSwapper.executeLimitOrder(orderId);
      await tx.wait(1);
      const { status } = await limitSwapper.getOrder(orderId);
      assert.equal(status, ORDER_FILLED);
    });
    it('emits an OrderFilled event if order was executed successfully', async () => {
      const { limitSwapper, signer1, mockUsdc, mockWeth, mockSwapRouter } = await loadFixture(
        deployLimitSwapperFixture,
      );
      const inputAmount = ethers.utils.parseUnits('100', 6);
      const outputAmount = ethers.utils.parseEther('0.0625'); //at rate 1ETH = 1600USDC
      const orderId = await createOrder(
        mockUsdc.address,
        mockWeth.address,
        signer1.address,
        inputAmount,
        outputAmount,
        limitSwapper,
        signer1,
      );

      console.log(`Address of usdc mock: ${mockUsdc.address}`);
      //setup mocks
      await mockUsdc.mock.transferFrom.returns(true);
      await mockUsdc.mock.increaseAllowance.returns(true);
      await mockSwapRouter.mock.exactInputSingle.returns(outputAmount);

      await expect(limitSwapper.executeLimitOrder(orderId)).to.emit(limitSwapper, 'OrderFilled');
    });
    it('reverts if trying to execute outside price range', async () => {
      const { limitSwapper, signer1, mockUsdc, mockWeth, mockSwapRouter } = await loadFixture(
        deployLimitSwapperFixture,
      );
      const inputAmount = ethers.utils.parseUnits('100', 6);
      const outputAmount = ethers.utils.parseEther('0.0625'); //at rate 1ETH = 1600USDC
      const orderId = await createOrder(
        mockUsdc.address,
        mockWeth.address,
        signer1.address,
        inputAmount,
        outputAmount,
        limitSwapper,
        signer1,
      );

      console.log(`Address of usdc mock: ${mockUsdc.address}`);
      //setup mocks
      await mockUsdc.mock.transferFrom.returns(true);
      await mockUsdc.mock.increaseAllowance.returns(true);
      await mockSwapRouter.mock.exactInputSingle.reverts();

      await expect(limitSwapper.executeLimitOrder(orderId)).to.be.reverted;
    });

    it('reverts if token transfer returns false', async () => {
      const { limitSwapper, signer1, mockUsdc, mockWeth, mockSwapRouter } = await loadFixture(
        deployLimitSwapperFixture,
      );
      const inputAmount = ethers.utils.parseUnits('100', 6);
      const outputAmount = ethers.utils.parseEther('0.0625'); //at rate 1ETH = 1600USDC
      const orderId = await createOrder(
        mockUsdc.address,
        mockWeth.address,
        signer1.address,
        inputAmount,
        outputAmount,
        limitSwapper,
        signer1,
      );

      console.log(`Address of usdc mock: ${mockUsdc.address}`);
      //setup mocks
      await mockUsdc.mock.transferFrom.returns(false);
      await mockUsdc.mock.increaseAllowance.returns(true);
      await mockSwapRouter.mock.exactInputSingle.returns(outputAmount);

      await expect(limitSwapper.executeLimitOrder(orderId)).to.be.revertedWithCustomError(
        limitSwapper,
        'LimitSwapperERC20TransferFromFailed',
      );
    });
  });
});

const createOrder = async (
  sourceToken: string,
  destinationToken: string,
  receiver: string,
  amountOfSourceToken: BigNumber,
  amountOfDestinationToken: BigNumber,
  limitSwapper: ILimitSwapper,
  signer: SignerWithAddress,
): Promise<BigNumber> => {
  let tx = await limitSwapper
    .connect(signer)
    .createLimitOrder(sourceToken, destinationToken, receiver, amountOfSourceToken, amountOfDestinationToken);
  const receipt = await tx.wait(1);
  const { orderId } = receipt.events![0].args;
  return orderId;
};
