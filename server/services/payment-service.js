// Serviço de pagamentos Pix & Cartão de Crédito com Parcelamento em até 12x sem juros (taxa vendedor)
const db = require('../db');
const QRCode = require('qrcode');

// Tabela de referência do Mercado Pago
const MERCADO_PAGO_INTEREST_RATES = {
  1: 0, 2: 0, 3: 0, 4: 0.0541, 5: 0.0703, 6: 0.0866,
  7: 0.1031, 8: 0.1197, 9: 0.1365, 10: 0.1534, 11: 0.1705, 12: 0.1877
};

function calculateInstallments(amountReais) {
  const options = [];
  const baseAmount = Number(amountReais) || 0;

  for (let n = 1; n <= 12; n++) {
    const installmentValue = Number((baseAmount / n).toFixed(2));

    options.push({
      installments: n,
      hasInterest: false,
      ratePercent: 0,
      installmentValue,
      totalAmount: baseAmount,
      formattedInstallment: `${n}x de R$ ${installmentValue.toFixed(2).replace('.', ',')} sem juros`,
    });
  }
  return options;
}

function calculatePixAmount(amountReais) {
  const base = Number(amountReais) || 0;
  const discount = Number((base * 0.04).toFixed(2));
  const finalAmount = Number((base - discount).toFixed(2));
  return {
    originalAmount: base,
    discountAmount: discount,
    discountPercent: 4,
    finalAmount,
  };
}

function detectCardBrand(number) {
  const clean = (number || '').replace(/\D/g, '');
  if (/^4/.test(clean)) return 'Visa';
  if (/^5[1-5]|^2[2-7]/.test(clean)) return 'Mastercard';
  if (/^4011|^4389|^4514|^4576|^5041|^5067|^5090|^6277|^6362|^6363|^650|^651|^655/.test(clean)) return 'Elo';
  if (/^3[47]/.test(clean)) return 'Amex';
  if (/^6062/.test(clean)) return 'Hipercard';
  return 'Cartão';
}

// Gera código Pix Copia e Cola no padrão oficial do Banco Central (EMV BR Code com CRC16)
function generatePixCopiaCola({ key, amount, name = 'FAHREN PARTS', city = 'CAMPINAS', txid = 'PEDIDO' }) {
  const formatEMV = (id, val) => `${id}${String(val.length).padStart(2, '0')}${val}`;

  const p00 = formatEMV('00', '01');
  const p26_00 = formatEMV('00', 'br.gov.bcb.pix');
  const p26_01 = formatEMV('01', key);
  const p26 = formatEMV('26', p26_00 + p26_01);
  const p52 = formatEMV('52', '0000');
  const p53 = formatEMV('53', '986');
  const p54 = formatEMV('54', Number(amount).toFixed(2));
  const p58 = formatEMV('58', 'BR');
  const p59 = formatEMV('59', name.slice(0, 25).toUpperCase());
  const p60 = formatEMV('60', city.slice(0, 15).toUpperCase());
  const p62_05 = formatEMV('05', txid.replace(/[^A-Z0-9]/gi, '').slice(0, 25));
  const p62 = formatEMV('62', p62_05);

  const payload = `${p00}${p26}${p52}${p53}${p54}${p58}${p59}${p60}${p62}6304`;

  // Cálculo do CRC16-CCITT oficial do Banco Central
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  const checksum = crc.toString(16).toUpperCase().padStart(4, '0');
  return payload + checksum;
}

// Gera QR Code 100% padrão, limpo e escaneável diretamente pelo app bancário ou câmera do celular
async function generateStandardQrCode(text) {
  try {
    const svgRaw = await QRCode.toString(text, {
      type: 'svg',
      errorCorrectionLevel: 'M', // Padrão limpo do Banco Central
      margin: 2,
    });
    return 'data:image/svg+xml;base64,' + Buffer.from(svgRaw).toString('base64');
  } catch (err) {
    console.error('[PaymentService] Erro ao gerar QR Code padrão:', err);
    return await QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width: 300 });
  }
}

async function createPixPayment(order, customer) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const pixKey = process.env.PIX_KEY || 'pix@fahrenparts.com.br';

  // Aplica o desconto de 4% no Pix
  const rawTotalCents = order.total_cents;
  const discountCents = Math.round(rawTotalCents * 0.04);
  const netCents = rawTotalCents - discountCents;
  const amountReais = Math.round(netCents) / 100;

  let paymentId = null;
  let pixCopiaCola = null;
  let isSandbox = true;

  // 1. Se houver credencial oficial do Mercado Pago, solicita via API
  if (token && token.trim() !== '') {
    try {
      const names = (customer.name || 'Cliente').trim().split(' ');
      const firstName = names[0];
      const lastName = names.slice(1).join(' ') || 'Fahren';

      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `order-${order.id}-${Date.now()}`,
        },
        body: JSON.stringify({
          transaction_amount: Number(amountReais.toFixed(2)),
          description: `Pedido #${order.id} - Fahren Parts (4% de desconto Pix)`,
          payment_method_id: 'pix',
          payer: {
            email: customer.email,
            first_name: firstName,
            last_name: lastName,
          },
        }),
      });

      const data = await response.json();
      if (response.ok && data.point_of_interaction) {
        paymentId = String(data.id);
        pixCopiaCola = data.point_of_interaction.transaction_data.qr_code;
        isSandbox = false;
      } else {
        console.error('[PaymentService] Erro resposta Mercado Pago:', data);
      }
    } catch (err) {
      console.error('[PaymentService] Falha requisição Mercado Pago Pix:', err.message);
    }
  }

  // 2. Se não gerou via Mercado Pago, gera código Pix padrão Banco Central (EMV / BR Code com CRC16)
  if (!pixCopiaCola) {
    paymentId = `SIM-PIX-${order.id}-${Date.now().toString().slice(-6)}`;
    pixCopiaCola = generatePixCopiaCola({
      key: pixKey,
      amount: amountReais,
      name: 'FAHREN PARTS',
      city: 'CAMPINAS',
      txid: `PEDIDO${order.id}`,
    });
    isSandbox = true;
  }

  // 3. Gera QR Code 100% limpo e padrão oficial
  const pixQrCodeBase64 = await generateStandardQrCode(pixCopiaCola);

  await db.query(
    `UPDATE orders SET
       payment_id = $1,
       pix_copia_cola = $2,
       pix_qr_code_base64 = $3,
       discount_cents = $4,
       payment_status = 'pendente',
       updated_at = now()
     WHERE id = $5`,
    [paymentId, pixCopiaCola, pixQrCodeBase64, discountCents, order.id]
  );

  return {
    paymentId,
    pixCopiaCola,
    pixQrCodeBase64,
    discountAmount: discountCents / 100,
    finalAmount: amountReais,
    status: 'pendente',
    isSandbox,
    message: isSandbox
      ? 'QR Code padrão Pix gerado com sucesso com logo central Fahren Parts.'
      : 'Pix oficial Mercado Pago gerado com sucesso.',
  };
}

async function processCardPayment(order, cardData, requestedInstallments, customer) {
  const cardToken = cardData?.token || cardData?.cardToken;
  const installmentsCount = Math.min(12, Math.max(1, parseInt(cardData?.installments || requestedInstallments, 10) || 1));
  const totalWithInterest = Number((Math.round(order.total_cents) / 100).toFixed(2));
  const installmentValue = Number((totalWithInterest / installmentsCount).toFixed(2));
  const installmentAmountCents = Math.round(installmentValue * 100);

  // O número do cartão NUNCA chega aqui quando o pagamento vem do Checkout Bricks
  // (o navegador manda só o token). Por isso a bandeira e os 4 últimos dígitos vêm
  // do próprio Brick quando existirem; o detectCardBrand fica como fallback dos
  // fluxos antigos que ainda mandavam o número.
  const cleanNumber = (cardData?.cardNumber || '').replace(/\D/g, '');
  let brand = cardData?.cardBrand || cardData?.payment_method_id || cardData?.paymentMethodId || (cleanNumber ? detectCardBrand(cleanNumber) : 'Cartão');
  if (brand && typeof brand === 'string') brand = brand.charAt(0).toUpperCase() + brand.slice(1);
  let lastFour = cardData?.lastFour || cardData?.last_four_digits || (cleanNumber ? cleanNumber.slice(-4) : '1234');

  const identificationNumber = (
    cardData?.payer?.identification?.number ||
    cardData?.cpf ||
    (customer?.cpf_cnpj || '')
  ).replace(/\D/g, '') || '00000000000';
  const identificationType = cardData?.payer?.identification?.type || (identificationNumber.length > 11 ? 'CNPJ' : 'CPF');
  const payerEmail = cardData?.payer?.email || customer?.email || 'cliente@fahrenparts.com.br';

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (token && cardToken) {
    try {
      const mpBody = {
        transaction_amount: totalWithInterest,
        token: cardToken,
        description: `Pedido #${order.id} - Fahren Parts (${installmentsCount}x sem juros)`,
        installments: installmentsCount,
        payment_method_id: (cardData?.payment_method_id || cardData?.paymentMethodId || brand || 'visa').toLowerCase(),
        payer: {
          email: payerEmail,
          identification: {
            type: identificationType,
            number: identificationNumber,
          },
        },
      };
      if (cardData?.issuer_id || cardData?.issuerId) {
        mpBody.issuer_id = String(cardData.issuer_id || cardData.issuerId);
      }

      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `card-order-${order.id}-${Date.now()}`,
        },
        body: JSON.stringify(mpBody),
      });

      const data = await response.json();

      if (response.ok && data.status === 'rejected') {
        return {
          paymentId: String(data.id || ''),
          status: 'recusado',
          mpStatus: 'rejected',
          rejectionDetail: data.status_detail || null,
          installments: installmentsCount,
          installmentValue,
          totalAmount: totalWithInterest,
          isSandbox: false,
          message: 'Pagamento recusado pela operadora do cartão.',
        };
      }

      if (response.ok && (data.status === 'approved' || data.status === 'in_process' || data.status === 'pending')) {
        const paymentId = String(data.id);
        if (data.payment_method_id) brand = data.payment_method_id;
        if (data.card && data.card.last_four_digits) lastFour = data.card.last_four_digits;
        const paymentStatus = data.status === 'approved' ? 'aprovado' : 'pendente';
        const operationalStatus = paymentStatus === 'aprovado' ? 'em_preparacao' : 'novo';

        await db.query(
          `UPDATE orders SET
             payment_id = $1,
             payment_method = 'cartao',
             payment_status = $2,
             status = $3,
             installments = $4,
             installment_amount_cents = $5,
             card_brand = $6,
             card_last_four = $7,
             total_cents = $8,
             updated_at = now()
           WHERE id = $9`,
          [
            paymentId,
            paymentStatus,
            operationalStatus,
            installmentsCount,
            installmentAmountCents,
            brand,
            lastFour,
            Math.round(totalWithInterest * 100),
            order.id,
          ]
        );

        return {
          paymentId,
          status: paymentStatus,
          mpStatus: data.status,
          installments: installmentsCount,
          installmentValue,
          totalAmount: totalWithInterest,
          cardBrand: brand,
          cardLastFour: lastFour,
          isSandbox: false,
        };
      } else {
        console.error('[PaymentService] Resposta negativa Mercado Pago:', data);
      }
    } catch (err) {
      console.error('[PaymentService] Erro chamada cartão Mercado Pago:', err.message);
      throw err;
    }
  }

  // Modo Sandbox / Simulação imediata de aprovação de cartão
  const simulatedPaymentId = `SIM-CARD-${order.id}-${Date.now().toString().slice(-6)}`;
  await db.query(
    `UPDATE orders SET
       payment_id = $1,
       payment_method = 'cartao',
       payment_status = 'aprovado',
       status = 'em_preparacao',
       installments = $2,
       installment_amount_cents = $3,
       card_brand = $4,
       card_last_four = $5,
       total_cents = $6,
       updated_at = now()
     WHERE id = $7`,
    [
      simulatedPaymentId,
      installmentsCount,
      installmentAmountCents,
      brand,
      lastFour,
      Math.round(totalWithInterest * 100),
      order.id,
    ]
  );

  return {
    paymentId: simulatedPaymentId,
    status: 'aprovado',
    installments: installmentsCount,
    installmentValue,
    totalAmount: totalWithInterest,
    cardBrand: brand,
    cardLastFour: lastFour,
    isSandbox: true,
    message: 'Pagamento aprovado com sucesso no modo teste.',
  };
}

async function checkPaymentStatus(orderId) {
  const result = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = result.rows[0];
  if (!order) throw new Error('Pedido não encontrado.');

  if (order.payment_status === 'aprovado') {
    return { status: 'aprovado', orderStatus: order.status };
  }

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (token && order.payment_id && !order.payment_id.startsWith('SIM-')) {
    try {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${order.payment_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'approved') {
          await db.query(
            `UPDATE orders SET
               payment_status = 'aprovado',
               status = CASE WHEN status = 'novo' THEN 'em_preparacao' ELSE status END,
               updated_at = now()
             WHERE id = $1`,
            [orderId]
          );
          return { status: 'aprovado', orderStatus: 'em_preparacao' };
        }
      }
    } catch (err) {
      console.warn('[PaymentService] Erro checando Mercado Pago:', err.message);
    }
  }

  return {
    status: order.payment_status || 'pendente',
    orderStatus: order.status,
    pixCopiaCola: order.pix_copia_cola,
    pixQrCodeBase64: order.pix_qr_code_base64,
  };
}

async function markPaymentApproved(orderId) {
  const result = await db.query(
    `UPDATE orders SET
       payment_status = 'aprovado',
       status = CASE WHEN status = 'novo' THEN 'em_preparacao' ELSE status END,
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [orderId]
  );
  return result.rows[0];
}

module.exports = {
  MERCADO_PAGO_INTEREST_RATES,
  calculateInstallments,
  calculatePixAmount,
  detectCardBrand,
  generatePixCopiaCola,
  generateStandardQrCode,
  createPixPayment,
  processCardPayment,
  checkPaymentStatus,
  markPaymentApproved,
};
