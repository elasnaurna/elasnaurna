// ============================================================
//  ELAS NA URNA — situação de todas as candidaturas (TSE)
//  Cole no Console com a página do DivulgaCandContas aberta.
//  ~3 minutos. Baixa um CSV ao final.
//  Traz TODOS os candidatos (a lista do TSE não informa o sexo);
//  o cruzamento com as mulheres é feito depois, pelo id.
// ============================================================
(async () => {
  const ELEICAO = "20322002026";
  const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA",
               "PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
  const CARGOS = { 3:"Governador", 4:"Vice-Governador", 5:"Senador",
                   6:"Deputado Federal", 7:"Deputado Estadual", 8:"Deputado Distrital" };
  // Presidente e Vice ficam na unidade eleitoral BR, com os cargos 1 e 2
  const CARGOS_BR = { 1:"Presidente", 2:"Vice-Presidente" };

  const linhas = [];
  let erros = 0, feitos = 0;
  const total = UFS.length * Object.keys(CARGOS).length + Object.keys(CARGOS_BR).length;
  console.log("Buscando... ~3 minutos. Deixe a aba aberta e visível.\n");

  for (const uf of UFS) {
    for (const [cd, nomeCargo] of Object.entries(CARGOS)) {
      const url = `/divulga/rest/v1/candidatura/listar/2026/${uf}/${ELEICAO}/${cd}/candidatos`;
      try {
        const r = await fetch(url);
        feitos++;
        if (!r.ok) { erros++; continue; }
        const d = await r.json();
        for (const c of (d.candidatos || [])) {
          linhas.push({
            sq: c.id,
            nome: c.nomeUrna || "",
            cargo: nomeCargo,
            uf: uf,
            partido: (c.partido && c.partido.sigla) || c.nomeColigacao || "",
            numero: c.numero || "",
            situacao: c.descricaoSituacao || "",
            totalizacao: c.descricaoTotalizacao || "",
            inapto: (c.isCandidatoInapto === true) ? "SIM" : "nao",
            apto: (c.candidatoApto === true) ? "SIM" : "nao"
          });
        }
      } catch (e) { erros++; feitos++; }
      if (feitos % 20 === 0) console.log(`  ${feitos}/${total} — ${linhas.length} candidaturas`);
      await new Promise(s => setTimeout(s, 120));
    }
  }

  // Presidente e Vice (unidade eleitoral BR)
  for (const [cd, nomeCargo] of Object.entries(CARGOS_BR)) {
    const url = `/divulga/rest/v1/candidatura/listar/2026/BR/${ELEICAO}/${cd}/candidatos`;
    try {
      const r = await fetch(url);
      feitos++;
      if (r.ok) {
        const d = await r.json();
        for (const c of (d.candidatos || [])) {
          linhas.push({
            sq: c.id, nome: c.nomeUrna || "", cargo: nomeCargo, uf: "BR",
            partido: (c.partido && c.partido.sigla) || c.nomeColigacao || "",
            numero: c.numero || "",
            situacao: c.descricaoSituacao || "",
            totalizacao: c.descricaoTotalizacao || "",
            inapto: (c.isCandidatoInapto === true) ? "SIM" : "nao",
            apto: (c.candidatoApto === true) ? "SIM" : "nao"
          });
        }
      } else erros++;
    } catch (e) { erros++; feitos++; }
    await new Promise(s => setTimeout(s, 120));
  }
  console.log(`  Presidente/Vice incluídos — total ${linhas.length} candidaturas`);

  const conta = (campo) => linhas.reduce((a, l) => {
    const k = l[campo] || "(vazio)"; a[k] = (a[k] || 0) + 1; return a; }, {});

  console.log(`\n=== ${linhas.length} candidaturas (${erros} consultas falharam) ===`);
  if (linhas.length) {
    console.log("\nPor SITUAÇÃO:");    console.table(conta("situacao"));
    console.log("\nPor TOTALIZAÇÃO:");  console.table(conta("totalizacao"));
    console.log("\nINAPTO:");           console.table(conta("inapto"));

    const cols = Object.keys(linhas[0]);
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + cols.join(",") + "\n" +
                linhas.map(l => cols.map(c => esc(l[c])).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "situacao-candidaturas.csv";
    a.click();
    console.log("\n✅ CSV baixado: situacao-candidaturas.csv");
  } else {
    console.log("Nada foi coletado — me avise.");
  }
})();
