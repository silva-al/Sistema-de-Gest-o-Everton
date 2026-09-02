// Serviço de consulta veicular por placa (padrão Mercosul e antigo)
const cache = new Map();

// Base de modelos populares brasileiros para modo demonstração / desenvolvimento
const SAMPLE_VEHICLES = [
  { brand: 'VOLKSWAGEN', model: 'T-Cross Highline', engine: '1.4 TSI Turbo 150cv', fuel: 'Flex', color: 'Prata Sirius', modelYear: 2022, fabricYear: 2021, city: 'Campinas', state: 'SP', categoryHints: ['Freios', 'Filtros', 'Elétrica e ignição'] },
  { brand: 'CHEVROLET', model: 'Onix Plus Premier', engine: '1.0 Turbo ECOTEC', fuel: 'Flex', color: 'Branco Summit', modelYear: 2023, fabricYear: 2023, city: 'São Paulo', state: 'SP', categoryHints: ['Filtros', 'Óleos e fluidos', 'Freios'] },
  { brand: 'HYUNDAI', model: 'HB20 Evolution', engine: '1.0 12V Kappa', fuel: 'Flex', color: 'Cinza Silk', modelYear: 2021, fabricYear: 2020, city: 'Campinas', state: 'SP', categoryHints: ['Freios', 'Correias', 'Filtros'] },
  { brand: 'FIAT', model: 'Toro Volcano', engine: '2.0 16V Turbo Diesel 4x4', fuel: 'Diesel', color: 'Preto Carbon', modelYear: 2022, fabricYear: 2022, city: 'Sorocaba', state: 'SP', categoryHints: ['Suspensão', 'Filtros', 'Freios'] },
  { brand: 'JEEP', model: 'Renegade Longitude', engine: '1.3 Turbo T270', fuel: 'Flex', color: 'Vermelho Colorado', modelYear: 2023, fabricYear: 2022, city: 'Ribeirão Preto', state: 'SP', categoryHints: ['Freios', 'Suspensão', 'Elétrica e ignição'] },
  { brand: 'TOYOTA', model: 'Corolla XEi', engine: '2.0 Dynamic Force Dual VVT-iE', fuel: 'Flex', color: 'Cinza Granito', modelYear: 2022, fabricYear: 2021, city: 'Indaiatuba', state: 'SP', categoryHints: ['Freios', 'Filtros', 'Óleos e fluidos'] },
  { brand: 'HONDA', model: 'Civic Touring', engine: '1.5 Turbo DOHC VTEC', fuel: 'Gasolina', color: 'Preto Cristal', modelYear: 2020, fabricYear: 2020, city: 'Campinas', state: 'SP', categoryHints: ['Freios', 'Elétrica e ignição', 'Filtros'] },
  { brand: 'VOLKSWAGEN', model: 'Gol 1.0 MPI', engine: '1.0 3 Cilindros 12V', fuel: 'Flex', color: 'Branco Cristal', modelYear: 2021, fabricYear: 2020, city: 'Sumaré', state: 'SP', categoryHints: ['Correias', 'Filtros', 'Freios'] },
];

function cleanPlate(plate) {
  return (plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isValidPlate(plate) {
  const cleaned = cleanPlate(plate);
  // Padrão antigo: ABC1234 | Mercosul: ABC1D23
  return /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(cleaned);
}

function formatPlate(plate) {
  const c = cleanPlate(plate);
  if (c.length !== 7) return plate;
  // Se for o formato antigo (3 letras + 4 números), formata ABC-1234
  if (/^[A-Z]{3}[0-9]{4}$/.test(c)) {
    return `${c.slice(0, 3)}-${c.slice(3)}`;
  }
  // Mercosul mantém sem traço ou ABC1D23
  return c;
}

function getDeterministicSample(plate) {
  let hash = 0;
  for (let i = 0; i < plate.length; i++) {
    hash = (hash * 31 + plate.charCodeAt(i)) >>> 0;
  }
  const sample = SAMPLE_VEHICLES[hash % SAMPLE_VEHICLES.length];
  return {
    ...sample,
    plate: formatPlate(plate),
    rawPlate: cleanPlate(plate),
    chassiMasked: '9BW***' + String(10000 + (hash % 89999)),
    isMock: true,
    infoMessage: 'Dados em modo simulação. Para dados 100% reais do Detran, defina VEHICLE_API_TOKEN no arquivo .env.',
  };
}

async function consultPlate(rawPlate) {
  const plate = cleanPlate(rawPlate);
  if (!isValidPlate(plate)) {
    throw new Error('Formato de placa inválido. Digite uma placa padrão Mercosul (ex: ABC1D23) ou tradicional (ex: ABC1234).');
  }

  // Verifica cache
  if (cache.has(plate)) {
    return cache.get(plate);
  }

  const token = process.env.VEHICLE_API_TOKEN;
  const apiUrl = process.env.VEHICLE_API_URL || 'https://wdapi2.com.br/consulta';

  // Se houver token configurado, tenta a API real
  if (token && token.trim() !== '') {
    try {
      const url = `${apiUrl.replace(/\/+$/, '')}/${plate}/${token}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        // Normaliza resposta dos provedores brasileiros comuns
        const result = {
          plate: formatPlate(plate),
          rawPlate: plate,
          brand: data.marca || data.brand || 'Não informado',
          model: data.modelo || data.model || 'Não informado',
          engine: data.motor || data.potencia || 'Compatível',
          fuel: data.combustivel || data.fuel || 'Flex',
          color: data.cor || data.color || 'Não informada',
          modelYear: Number(data.anoModelo || data.ano_modelo || data.year) || null,
          fabricYear: Number(data.ano || data.ano_fabricacao) || null,
          city: data.municipio || data.cidade || '',
          state: data.uf || data.estado || '',
          chassiMasked: data.chassi ? `***${data.chassi.slice(-5)}` : undefined,
          fipeValue: data.fipe_valor || data.valor_fipe || null,
          categoryHints: ['Freios', 'Filtros', 'Elétrica e ignição', 'Óleos e fluidos'],
          isMock: false,
        };
        cache.set(plate, result);
        return result;
      }
    } catch (err) {
      console.warn(`[VehicleService] Falha na consulta externa da placa ${plate}: ${err.message}. Usando base de fallback.`);
    }
  }

  // Fallback simulado determinístico
  const sample = getDeterministicSample(plate);
  cache.set(plate, sample);
  return sample;
}

module.exports = {
  cleanPlate,
  isValidPlate,
  formatPlate,
  consultPlate,
};
