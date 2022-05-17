import { tokens, EVM_REVERT, ETHER_ADDRESS, ether } from './helpers';

const Exchange = artifacts.require('./Exchange');
const Token = artifacts.require('./Token');

require('chai')
  .use(require('chai-as-promised'))
  .should()

contract('Exchange', ([deployer, feeAccount, user1, user2]) => {
	let token;
	let exchange;
	const feePercent = 10;

	beforeEach(async() => {
		// Deploy token
		token = await Token.new();
		// Transfer some tokens to user1
		token.transfer(user1, tokens(100), { from: deployer });
		// Deploy exchange
		exchange = await Exchange.new(feeAccount, feePercent);
	})

	describe('deployment', () => {
		it('tracts the fee account', async () => {
			// Read token name here
			const result = await exchange.feeAccount();
			// Check the token name is 'Get-Rugged'
			result.should.equal(feeAccount);
		})

		it('tracts the fee amount', async () => {
			const result = await exchange.feePercent()
			result.toString().should.equal(feePercent.toString());
		})
	})

	describe('fallback', () => {
		it('reverts when Ether is sent', async () => {
			await exchange.sendTransaction({ value: 1, from: user1 }).should.be.rejectedWith(EVM_REVERT);
		})
	})

	describe('depositing Ether', async () => {
		let result;
		let amount;

		beforeEach(async () => {
			amount = ether(1);
			result = await exchange.depositEther({ from: user1, value: amount })
		})

		it('tracts the Ether deposit', async () => {
			const balance = await exchange.tokens(ETHER_ADDRESS, user1);
			balance.toString().should.equal(amount.toString());
		})

		it('emits a Deposit event', async () => {
				const log = result.logs[0];
				log.event.should.equal('Deposit');
				const event = log.args;
				event.token.should.equal(ETHER_ADDRESS, 'token address is correct');
				event.user.should.equal(user1, 'user address is correct');
				event.amount.toString().should.equal(amount.toString(), 'amount is correct');
				event.balance.toString().should.equal(amount.toString(), 'balance is correct');
			})
	})

	describe('withdrawing Ether', async () => {
		let result;
		let amount;

		beforeEach(async () => {
			// Deposit Ether first
			amount = ether(1);
			await exchange.depositEther({ from: user1, value: ether(1) });
		})

		describe('success', async () => {
			beforeEach(async () => {
				// Withdraw Ether
				result = await exchange.withdrawEther(ether(1), { from: user1 })
			})

			it('withdraws Ether funds', async () => {
				const balance = await exchange.tokens(ETHER_ADDRESS, user1)
				balance.toString().should.equal('0');
			})

			it('emits a "Withdraw" event', async () => {
				const log = result.logs[0];
				log.event.should.equal('Withdraw');
				const event = log.args;
				event.token.should.equal(ETHER_ADDRESS);
				event.user.should.equal(user1);
				event.amount.toString().should.equal(amount.toString());
				event.balance.toString().should.equal('0');
			})
		})

		describe('failure', async () => {
			it('rejects withdraws for insufficient balances', async () => {
				await exchange.withdrawEther(ether(100), { from: user1 }).should.be.rejectedWith(EVM_REVERT);
			})
		})
	})

	describe('depositing tokens', () => {
		let result;
		let amount;

		describe('success', () => {
			beforeEach(async () => {
				amount = tokens(10)
				await token.approve(exchange.address, amount, { from: user1 });
				result = await exchange.depositToken(token.address, amount, {	from: user1 });
			})

			it('tracts the token deposit', async () => {
				// Check exchange token balance
				let balance;
				balance = await token.balanceOf(exchange.address);
				balance.toString().should.equal(amount.toString());
				// Check tokens on exchange
				balance = await exchange.tokens(token.address, user1);
				balance.toString().should.equal(amount.toString());
			})

			it('emits a Deposit event', async () => {
				const log = result.logs[0];
				log.event.should.equal('Deposit');
				const event = log.args;
				event.token.should.equal(token.address, 'token address is correct');
				event.user.should.equal(user1, 'user address is correct');
				event.amount.toString().should.equal(amount.toString(), 'amount is correct');
				event.balance.toString().should.equal(amount.toString(), 'balance is correct');
			})
		})

		describe('failure', () => {
			it('rejects ether deposits', async () => {
				await exchange.depositToken(ETHER_ADDRESS, tokens(10), { from: user1 }).should.be.rejectedWith(EVM_REVERT);
			})

			it('fails when no tokens are approved', async () => {
				// Don't approve any tokens before depositing
				await exchange.depositToken(token.address, tokens(10), { from : user1 }).should.be.rejectedWith(EVM_REVERT);
			})
		})
	})

	describe('withdrawing tokens', () => {
		let result;
		let amount;

		describe('success', async () => {
			beforeEach(async () => {
				amount = tokens(10);
				await token.approve(exchange.address, amount, { from: user1 });
				await exchange.depositToken(token.address, amount, { from: user1 });

				result = await exchange.withdrawToken(token.address, amount, { from: user1 });
			})

			it('withdraws token funds', async () => {
				const balance = await exchange.tokens(token.address, user1);
				balance.toString().should.equal('0');
			})

			it('emits a "Withdraw" event', async () => {
					const log = result.logs[0];
					log.event.should.equal('Withdraw');
					const event = log.args;
					event.token.should.equal(token.address);
					event.user.should.equal(user1);
					event.amount.toString().should.equal(amount.toString());
					event.balance.toString().should.equal('0');
				})
		})

		describe('failure', async () => {
			it('rejects Ether withdraws', async () => {
				await exchange.withdrawToken(ETHER_ADDRESS, tokens(10), { from: user1 }).should.be.rejectedWith(EVM_REVERT);
			})

			it('fails for insufficient funds', async () => {
				await exchange.withdrawToken(token.address, tokens(10), { from: user1 }).should.be.rejectedWith(EVM_REVERT);
			})
		})
	})

	describe('checking balances', () => {
		beforeEach(async () => {
			await exchange.depositEther({ from: user1, value: ether(1) });
		})

		it('returns user balance', async () => {
			const result = await exchange.balanceOf(ETHER_ADDRESS, user1);
			result.toString().should.equal(ether(1).toString());
		})
	})

	describe('making orders', () => {
		let result;

		beforeEach(async () => {
			result = await exchange.makeOrder(token.address, tokens(1), ETHER_ADDRESS, ether(1), { from: user1 });
		})

		it('tracts the newly created order', async () => {
			const orderCount = await exchange.orderCount();
			orderCount.toString().should.equal('1');
			const order = await exchange.orders('1');
			order.id.toString().should.equal('1', 'id is correct');
			order.user.should.equal(user1, 'user is correct');
			order.tokenGet.should.equal(token.address, 'tokenGet is correct');
			order.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct');
			order.tokenGive.should.equal(ETHER_ADDRESS, 'tokenGive is correct');
			order.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct');
			order.timestamp.toString().length.should.be.at.least(1, 'timestampt is present');
		})

		it('emits an "Order" event', () => {
			const log = result.logs[0];
			log.event.should.equal('Order');
			const event = log.args;
			event.id.toString().should.equal('1', 'id is correct');
			event.user.should.equal(user1, 'user is correct');
			event.tokenGet.should.equal(token.address, 'tokenGet is correct');
			event.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct');
			event.tokenGive.should.equal(ETHER_ADDRESS, 'tokenGive is correct');
			event.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct');
			event.timestamp.toString().length.should.be.at.least(1, 'timestampt is present');
	})

	describe('order actions', () => {
		beforeEach(async () => {
			// user1 deposits ether only
			await exchange.depositEther({ from: user1, value: ether(1) });

			// give tokens to user2
			await token.transfer(user2, tokens(100), { from: deployer });

			// user2 deposits tokens only
			await token.approve(exchange.address, tokens(2), { from: user2 });
			await exchange.depositToken(token.address, tokens(2), { from: user2 });

			// user 1 makes an order o buy tokens with
			await exchange.makeOrder(token.address, tokens(1), ETHER_ADDRESS, ether(1), { from: user1 });
		})

		describe('filling orders', () => {
			let result;

			describe('success', async () => {
				beforeEach(async () => {
					// user2 fills order
					result = await exchange.fillOrder('1', { from: user2 });
				})

				it('executes the trade & charges fees', async () => {
					let balance;
					balance = await exchange.balanceOf(token.address, user1);
					balance.toString().should.equal(tokens(1).toString(), 'user1 received tokens');
					balance = await exchange.balanceOf(ETHER_ADDRESS, user2);
					balance.toString().should.equal(ether(1).toString(), 'user2 received Ether');
					balance = await exchange.balanceOf(ETHER_ADDRESS, user1);
					balance.toString().should.equal('0', 'user1 Ether deducted');
					balance = await exchange.balanceOf(token.address, user2);
					balance.toString().should.equal(tokens(0.9).toString(), 'user2 tokens deducted with fee applied');
					const feeAccount = await exchange.feeAccount();
					balance = await exchange.balanceOf(token.address, feeAccount);
					balance.toString().should.equal(tokens(0.1).toString(), 'feeAccount received fee');
				})

				it('updated filled orders', async () => {
					const orderFilled = await exchange.orderFilled(1);
					orderFilled.should.equal(true);
				})

				it('emits a trade event', async () => {
					const log = result.logs[0];
					log.event.should.equal('Trade');
					const event = log.args;
					event.id.toString().should.equal('1', 'id is correct')
          event.user.should.equal(user1, 'user is correct')
          event.tokenGet.should.equal(token.address, 'tokenGet is correct')
          event.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct')
          event.tokenGive.should.equal(ETHER_ADDRESS, 'tokenGive is correct')
          event.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct')
          event.userFill.should.equal(user2, 'userFill is correct');
          event.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
				})
			})

			describe('failure', async () => {
				it('rejects invalid order ids', async () => {
					const invalidOrder = 99999;
					await exchange.fillOrder(invalidOrder, { from: user2 }).should.be.rejectedWith(EVM_REVERT);
				})

				it('rejects already filled order', async () => {
					await exchange.fillOrder('1', { from: user2 }).should.be.fulfilled;
					await exchange.fillOrder('1', { from: user2 }).should.be.rejectedWith(EVM_REVERT);
				})

				it('rejects cancelled order', async () => {
					await exchange.cancelOrder('1', { from: user1 }).should.be.fulfilled;
					await exchange.fillOrder('1', { from: user2 }).should.be.rejectedWith(EVM_REVERT);
				})
			})
		})

		describe('cancelling orders', () => {
			let result;

			describe('success', () => {
				beforeEach(async () => {
					result = await exchange.cancelOrder('1', { from: user1 })
				});

				it('updates cancelled orders', async () => {
					const orderCancelled = await exchange.orderCancelled(1);
					orderCancelled.should.equal(true);
				})

				it('emits a "Cancel" event', () => {
          const log = result.logs[0]
          log.event.should.eq('Cancel')
          const event = log.args
          event.id.toString().should.equal('1', 'id is correct')
          event.user.should.equal(user1, 'user is correct')
          event.tokenGet.should.equal(token.address, 'tokenGet is correct')
          event.amountGet.toString().should.equal(tokens(1).toString(), 'amountGet is correct')
          event.tokenGive.should.equal(ETHER_ADDRESS, 'tokenGive is correct')
          event.amountGive.toString().should.equal(ether(1).toString(), 'amountGive is correct')
          event.timestamp.toString().length.should.be.at.least(1, 'timestamp is present')
        })
			})

			describe('failure', () => {
				it('rejects invalid order ids', async () => {
					const invalidOrder = 99999;
					await exchange.cancelOrder(invalidOrder, { from: user1 }).should.be.rejectedWith(EVM_REVERT);
				})

				it('rejects unauthorized cancelations', async () => {
					await exchange.cancelOrder('1', { from: user2 }).should.be.rejectedWith(EVM_REVERT);
				})
			})
		})
	})
})
})