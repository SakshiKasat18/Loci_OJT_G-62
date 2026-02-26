const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const healthRouter = require("./routes/health");
const packsRouter = require("./routes/packs");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use("/packs", packsRouter);

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Backend running on http://localhost:${port}`));