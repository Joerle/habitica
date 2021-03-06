/* eslint-disable camelcase */
import iapModule from '../../../../../website/server/libs/inAppPurchases';
import payments from '../../../../../website/server/libs/payments/payments';
import applePayments from '../../../../../website/server/libs/payments/apple';
import iap from '../../../../../website/server/libs/inAppPurchases';
import {model as User} from '../../../../../website/server/models/user';
import common from '../../../../../website/common';
import moment from 'moment';

const i18n = common.i18n;

describe('Apple Payments', ()  => {
  let subKey = 'basic_3mo';

  describe('verifyGemPurchase', () => {
    let sku, user, token, receipt, headers;
    let iapSetupStub, iapValidateStub, iapIsValidatedStub, paymentBuyGemsStub, iapGetPurchaseDataStub;

    beforeEach(() => {
      token = 'testToken';
      sku = 'com.habitrpg.ios.habitica.iap.21gems';
      user = new User();
      receipt = `{"token": "${token}", "productId": "${sku}"}`;
      headers = {};

      iapSetupStub = sinon.stub(iapModule, 'setup')
        .returnsPromise().resolves();
      iapValidateStub = sinon.stub(iapModule, 'validate')
        .returnsPromise().resolves({});
      iapIsValidatedStub = sinon.stub(iapModule, 'isValidated')
        .returns(true);
      iapGetPurchaseDataStub = sinon.stub(iapModule, 'getPurchaseData')
        .returns([{productId: 'com.habitrpg.ios.Habitica.21gems',
                   transactionId: token,
        }]);
      paymentBuyGemsStub = sinon.stub(payments, 'buyGems').returnsPromise().resolves({});
    });

    afterEach(() => {
      iapModule.setup.restore();
      iapModule.validate.restore();
      iapModule.isValidated.restore();
      iapModule.getPurchaseData.restore();
      payments.buyGems.restore();
    });

    it('should throw an error if receipt is invalid', async () => {
      iapModule.isValidated.restore();
      iapIsValidatedStub = sinon.stub(iapModule, 'isValidated')
        .returns(false);

      await expect(applePayments.verifyGemPurchase(user, receipt, headers))
        .to.eventually.be.rejected.and.to.eql({
          httpCode: 401,
          name: 'NotAuthorized',
          message: applePayments.constants.RESPONSE_INVALID_RECEIPT,
        });
    });

    it('should throw an error if getPurchaseData is invalid', async () => {
      iapGetPurchaseDataStub.restore();
      iapGetPurchaseDataStub = sinon.stub(iapModule, 'getPurchaseData').returns([]);

      await expect(applePayments.verifyGemPurchase(user, receipt, headers))
        .to.eventually.be.rejected.and.to.eql({
          httpCode: 401,
          name: 'NotAuthorized',
          message: applePayments.constants.RESPONSE_NO_ITEM_PURCHASED,
        });
    });

    it('errors if the user cannot purchase gems', async () => {
      sinon.stub(user, 'canGetGems').returnsPromise().resolves(false);
      await expect(applePayments.verifyGemPurchase(user, receipt, headers))
        .to.eventually.be.rejected.and.to.eql({
          httpCode: 401,
          name: 'NotAuthorized',
          message: i18n.t('groupPolicyCannotGetGems'),
        });

      user.canGetGems.restore();
    });

    it('errors if amount does not exist', async () => {
      sinon.stub(user, 'canGetGems').returnsPromise().resolves(true);
      iapGetPurchaseDataStub.restore();
      iapGetPurchaseDataStub = sinon.stub(iapModule, 'getPurchaseData')
        .returns([{productId: 'badProduct',
                   transactionId: token,
        }]);

      await expect(applePayments.verifyGemPurchase(user, receipt, headers))
        .to.eventually.be.rejected.and.to.eql({
          httpCode: 401,
          name: 'NotAuthorized',
          message: applePayments.constants.RESPONSE_INVALID_ITEM,
        });

      user.canGetGems.restore();
    });

    const gemsCanPurchase = [
      {
        productId: 'com.habitrpg.ios.Habitica.4gems',
        amount: 1,
      },
      {
        productId: 'com.habitrpg.ios.Habitica.20gems',
        amount: 5.25,
      },
      {
        productId: 'com.habitrpg.ios.Habitica.21gems',
        amount: 5.25,
      },
      {
        productId: 'com.habitrpg.ios.Habitica.42gems',
        amount: 10.5,
      },
      {
        productId: 'com.habitrpg.ios.Habitica.84gems',
        amount: 21,
      },
    ];

    gemsCanPurchase.forEach(gemTest => {
      it(`purchases ${gemTest.productId} gems`, async () => {
        iapGetPurchaseDataStub.restore();
        iapGetPurchaseDataStub = sinon.stub(iapModule, 'getPurchaseData')
          .returns([{productId: gemTest.productId,
                     transactionId: token,
          }]);

        sinon.stub(user, 'canGetGems').returnsPromise().resolves(true);
        await applePayments.verifyGemPurchase(user, receipt, headers);

        expect(iapSetupStub).to.be.calledOnce;
        expect(iapValidateStub).to.be.calledOnce;
        expect(iapValidateStub).to.be.calledWith(iap.APPLE, receipt);
        expect(iapIsValidatedStub).to.be.calledOnce;
        expect(iapIsValidatedStub).to.be.calledWith({});
        expect(iapGetPurchaseDataStub).to.be.calledOnce;

        expect(paymentBuyGemsStub).to.be.calledOnce;
        expect(paymentBuyGemsStub).to.be.calledWith({
          user,
          paymentMethod: applePayments.constants.PAYMENT_METHOD_APPLE,
          amount: gemTest.amount,
          headers,
        });
        expect(user.canGetGems).to.be.calledOnce;
        user.canGetGems.restore();
      });
    });
  });

  describe('subscribe', () => {
    let sub, sku, user, token, receipt, headers, nextPaymentProcessing;
    let iapSetupStub, iapValidateStub, iapIsValidatedStub, paymentsCreateSubscritionStub, iapGetPurchaseDataStub;

    beforeEach(() => {
      sub = common.content.subscriptionBlocks[subKey];
      sku = 'com.habitrpg.ios.habitica.subscription.3month';

      token = 'test-token';
      headers = {};
      receipt = `{"token": "${token}"}`;
      nextPaymentProcessing = moment.utc().add({days: 2});

      iapSetupStub = sinon.stub(iapModule, 'setup')
        .returnsPromise().resolves();
      iapValidateStub = sinon.stub(iapModule, 'validate')
        .returnsPromise().resolves({});
      iapIsValidatedStub = sinon.stub(iapModule, 'isValidated')
        .returns(true);
      iapGetPurchaseDataStub = sinon.stub(iapModule, 'getPurchaseData')
        .returns([{
          expirationDate: moment.utc().subtract({day: 1}).toDate(),
          productId: sku,
          transactionId: token,
        }, {
          expirationDate: moment.utc().add({day: 1}).toDate(),
          productId: 'wrongsku',
          transactionId: token,
        }, {
          expirationDate: moment.utc().add({day: 1}).toDate(),
          productId: sku,
          transactionId: token,
        }]);
      paymentsCreateSubscritionStub = sinon.stub(payments, 'createSubscription').returnsPromise().resolves({});
    });

    afterEach(() => {
      iapModule.setup.restore();
      iapModule.validate.restore();
      iapModule.isValidated.restore();
      iapModule.getPurchaseData.restore();
      if (payments.createSubscription.restore) payments.createSubscription.restore();
    });

    it('should throw an error if sku is empty', async () => {
      await expect(applePayments.subscribe('', user, receipt, headers, nextPaymentProcessing))
        .to.eventually.be.rejected.and.to.eql({
          httpCode: 400,
          name: 'BadRequest',
          message: i18n.t('missingSubscriptionCode'),
        });
    });

    it('should throw an error if receipt is invalid', async () => {
      iapModule.isValidated.restore();
      iapIsValidatedStub = sinon.stub(iapModule, 'isValidated')
        .returns(false);

      await expect(applePayments.subscribe(sku, user, receipt, headers, nextPaymentProcessing))
        .to.eventually.be.rejected.and.to.eql({
          httpCode: 401,
          name: 'NotAuthorized',
          message: applePayments.constants.RESPONSE_INVALID_RECEIPT,
        });
    });

    const subOptions = [
      {
        sku: 'subscription1month',
        subKey: 'basic_earned',
      },
      {
        sku: 'com.habitrpg.ios.habitica.subscription.3month',
        subKey: 'basic_3mo',
      },
      {
        sku: 'com.habitrpg.ios.habitica.subscription.6month',
        subKey: 'basic_6mo',
      },
      {
        sku: 'com.habitrpg.ios.habitica.subscription.12month',
        subKey: 'basic_12mo',
      },
    ];
    subOptions.forEach(option => {
      it(`creates a user subscription for ${option.sku}`, async () => {
        iapModule.getPurchaseData.restore();
        iapGetPurchaseDataStub = sinon.stub(iapModule, 'getPurchaseData')
          .returns([{
            expirationDate: moment.utc().add({day: 1}).toDate(),
            productId: option.sku,
            transactionId: token,
          }]);
        sub = common.content.subscriptionBlocks[option.subKey];

        await applePayments.subscribe(option.sku, user, receipt, headers, nextPaymentProcessing);

        expect(iapSetupStub).to.be.calledOnce;
        expect(iapValidateStub).to.be.calledOnce;
        expect(iapValidateStub).to.be.calledWith(iap.APPLE, receipt);
        expect(iapIsValidatedStub).to.be.calledOnce;
        expect(iapIsValidatedStub).to.be.calledWith({});
        expect(iapGetPurchaseDataStub).to.be.calledOnce;

        expect(paymentsCreateSubscritionStub).to.be.calledOnce;
        expect(paymentsCreateSubscritionStub).to.be.calledWith({
          user,
          customerId: token,
          paymentMethod: applePayments.constants.PAYMENT_METHOD_APPLE,
          sub,
          headers,
          additionalData: receipt,
          nextPaymentProcessing,
        });
      });
    });

    it('errors when a user is already subscribed', async () => {
      payments.createSubscription.restore();
      user = new User();

      await applePayments.subscribe(sku, user, receipt, headers, nextPaymentProcessing);

      await expect(applePayments.subscribe(sku, user, receipt, headers, nextPaymentProcessing))
        .to.eventually.be.rejected.and.to.eql({
          httpCode: 401,
          name: 'NotAuthorized',
          message: applePayments.constants.RESPONSE_ALREADY_USED,
        });
    });
  });

  describe('cancelSubscribe ', () => {
    let user, token, receipt, headers, customerId, expirationDate;
    let iapSetupStub, iapValidateStub, iapIsValidatedStub, iapGetPurchaseDataStub, paymentCancelSubscriptionSpy;

    beforeEach(async () => {
      token = 'test-token';
      headers = {};
      receipt = `{"token": "${token}"}`;
      customerId = 'test-customerId';
      expirationDate = moment.utc();

      iapSetupStub = sinon.stub(iapModule, 'setup')
        .returnsPromise().resolves();
      iapValidateStub = sinon.stub(iapModule, 'validate')
        .returnsPromise().resolves({
          expirationDate,
        });
      iapGetPurchaseDataStub = sinon.stub(iapModule, 'getPurchaseData')
        .returns([{expirationDate: expirationDate.toDate()}]);
      iapIsValidatedStub = sinon.stub(iapModule, 'isValidated')
        .returns(true);

      user = new User();
      user.profile.name = 'sender';
      user.purchased.plan.paymentMethod = applePayments.constants.PAYMENT_METHOD_APPLE;
      user.purchased.plan.customerId = customerId;
      user.purchased.plan.planId = subKey;
      user.purchased.plan.additionalData = receipt;

      paymentCancelSubscriptionSpy = sinon.stub(payments, 'cancelSubscription').returnsPromise().resolves({});
    });

    afterEach(function () {
      iapModule.setup.restore();
      iapModule.validate.restore();
      iapModule.isValidated.restore();
      iapModule.getPurchaseData.restore();
      payments.cancelSubscription.restore();
    });

    it('should throw an error if we are missing a subscription', async () => {
      user.purchased.plan.paymentMethod = undefined;

      await expect(applePayments.cancelSubscribe(user, headers))
        .to.eventually.be.rejected.and.to.eql({
          httpCode: 401,
          name: 'NotAuthorized',
          message: i18n.t('missingSubscription'),
        });
    });

    it('should throw an error if subscription is still valid', async () => {
      iapModule.getPurchaseData.restore();
      iapGetPurchaseDataStub = sinon.stub(iapModule, 'getPurchaseData')
        .returns([{expirationDate: expirationDate.add({day: 1}).toDate()}]);

      await expect(applePayments.cancelSubscribe(user, headers))
        .to.eventually.be.rejected.and.to.eql({
          httpCode: 401,
          name: 'NotAuthorized',
          message: applePayments.constants.RESPONSE_STILL_VALID,
        });
    });

    it('should throw an error if receipt is invalid', async () => {
      iapModule.isValidated.restore();
      iapIsValidatedStub = sinon.stub(iapModule, 'isValidated')
        .returns(false);

      await expect(applePayments.cancelSubscribe(user, headers))
        .to.eventually.be.rejected.and.to.eql({
          httpCode: 401,
          name: 'NotAuthorized',
          message: applePayments.constants.RESPONSE_INVALID_RECEIPT,
        });
    });

    it('should cancel a user subscription', async () => {
      await applePayments.cancelSubscribe(user, headers);

      expect(iapSetupStub).to.be.calledOnce;
      expect(iapValidateStub).to.be.calledOnce;
      expect(iapValidateStub).to.be.calledWith(iap.APPLE, receipt);
      expect(iapIsValidatedStub).to.be.calledOnce;
      expect(iapIsValidatedStub).to.be.calledWith({
        expirationDate,
      });
      expect(iapGetPurchaseDataStub).to.be.calledOnce;

      expect(paymentCancelSubscriptionSpy).to.be.calledOnce;
      expect(paymentCancelSubscriptionSpy).to.be.calledWith({
        user,
        paymentMethod: applePayments.constants.PAYMENT_METHOD_APPLE,
        nextBill: expirationDate.toDate(),
        headers,
      });
    });
  });
});
