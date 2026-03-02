const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const healthRouter = require("./routes/health");
const packsRouter = require("./routes/packs");
const authRouter = require("./routes/auth");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/packs", packsRouter);

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Backend running on http://localhost:${port}`));
