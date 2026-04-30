// start.js
const { exec } = require("child_process");

console.log("Instalando dependências...");

exec("npm install", (err, stdout, stderr) => {
  if (err) {
    console.error("Erro ao instalar dependências:", err);
    return;
  }

  console.log(stdout);

  console.log("Rodando index.js...");

  const run = exec("node index.js");

  run.stdout.on("data", (data) => {
    console.log(data.toString());
  });

  run.stderr.on("data", (data) => {
    console.error(data.toString());
  });
});