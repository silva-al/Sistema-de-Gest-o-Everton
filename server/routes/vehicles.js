// Rota de consulta de veículos por placa
const express = require('express');
const { consultPlate, isValidPlate, formatPlate } = require('../services/vehicle-service');

const router = express.Router();

router.get('/plate/:plate', async (req, res) => {
  try {
    const rawPlate = req.params.plate;
    if (!rawPlate) {
      return res.status(400).json({ error: 'Informe a placa do veículo.' });
    }

    const vehicle = await consultPlate(rawPlate);
    res.json({ vehicle });
  } catch (err) {
    console.error('[Route:Vehicles]', err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
