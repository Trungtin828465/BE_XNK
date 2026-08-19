require('dotenv').config();

const express = require('express');
const cors = require('cors');
const appsScriptRoutes = require('./routes/appsScriptRoutes');
const authRouter = require('./routes/authRouter');

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: 'http://localhost:3000',
  }),
);
app.use(express.json());
app.use('/api', appsScriptRoutes);
app.use('/api/auth', authRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
