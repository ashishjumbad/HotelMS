import app from "../backend/app.js";

export default function handler(req, res) {
  try {
    app(req, res);
  } catch (err) {
    res.status(500).send("Server Error");
  }
}