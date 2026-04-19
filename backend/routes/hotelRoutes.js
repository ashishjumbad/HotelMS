// const express = require("express");
// const router = express.Router();
// const { getHotels, updateStatus } = require("../controllers/hotelController");

// router.get("/", getHotels);
// router.patch("/:id/status", updateStatus);

// module.exports = router;


const express = require('express');
const router = express.Router();

// Placeholder routes - you can implement these later
router.get('/', (req, res) => {
  res.json({ message: 'Hotel routes working' });
});

router.get('/:id', (req, res) => {
  res.json({ message: `Get hotel ${req.params.id}` });
});

module.exports = router;