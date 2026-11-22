/* Catálogo de EXEMPLO do "Café Modelo", uma cafeteria fictícia, para a demonstração do painel.
   Itens e preços inventados, só para mostrar como o painel funciona (valores plausíveis para Curitiba).
   Num café de verdade, este arquivo é o cardápio e a loja do site do próprio café.

   Preços em centavos. p: número, ou lista de [variação, centavos] (tamanhos do cardápio).
   Loja: p null = "a consultar" (o painel pede o valor cobrado na hora da retirada). */

export const CARDAPIO = [
  // Cafés
  { id: "cafes-espresso", cat: "Cafés", nome: "Espresso", p: [["Simples", 800], ["Duplo", 1200]] },
  { id: "cafes-coado-v60", cat: "Cafés", nome: "Coado na V60", p: [["200 ml", 1600], ["300 ml", 2000]] },
  { id: "cafes-macchiato", cat: "Cafés", nome: "Macchiato", p: 1000 },
  { id: "cafes-cappuccino", cat: "Cafés", nome: "Cappuccino", p: [["200 ml", 1400], ["300 ml", 1700]] },
  { id: "cafes-latte", cat: "Cafés", nome: "Latte", p: [["200 ml", 1500], ["300 ml", 1800]] },
  { id: "cafes-flat-white", cat: "Cafés", nome: "Flat white", p: 1600 },
  { id: "cafes-mocha", cat: "Cafés", nome: "Mocha", p: 1800 },
  // Gelados
  { id: "gelados-cold-brew", cat: "Gelados", nome: "Cold brew", p: 1600 },
  { id: "gelados-espresso-tonica", cat: "Gelados", nome: "Espresso tônica", p: 1900 },
  { id: "gelados-latte-gelado", cat: "Gelados", nome: "Latte gelado", p: 1800 },
  // Sem café
  { id: "semcafe-cha", cat: "Sem café", nome: "Chá da casa", p: 1000 },
  { id: "semcafe-chai-latte", cat: "Sem café", nome: "Chai latte", p: 1700 },
  { id: "semcafe-chocolate-quente", cat: "Sem café", nome: "Chocolate quente", p: 1500 },
  { id: "semcafe-suco-de-laranja", cat: "Sem café", nome: "Suco de laranja", p: 1200 },
  // Para comer
  { id: "comer-pao-de-queijo", cat: "Para comer", nome: "Pão de queijo", p: [["1 unidade", 700], ["Porção com 3", 1800]] },
  { id: "comer-croissant", cat: "Para comer", nome: "Croissant", p: 1400 },
  { id: "comer-croissant-recheado", cat: "Para comer", nome: "Croissant presunto e queijo", p: 2200 },
  { id: "comer-tostada", cat: "Para comer", nome: "Tostada com manteiga", p: 1000 },
  { id: "comer-misto-quente", cat: "Para comer", nome: "Misto quente", p: 1800 },
  // Doces
  { id: "doces-bolo-do-dia", cat: "Doces", nome: "Bolo do dia (fatia)", p: 1300 },
  { id: "doces-cookie", cat: "Doces", nome: "Cookie", p: 1100 },
  { id: "doces-brownie", cat: "Doces", nome: "Brownie", p: 1300 },
  { id: "doces-torta-de-limao", cat: "Doces", nome: "Torta de limão (fatia)", p: 1600 },
];

/* Loja do site: o cliente monta o pedido e retira no café. */
export const LOJA = [
  { id: "graos-250", nome: "Café em grãos 250 g", p: 4900, opcoes: ["Em grãos", "Moído para filtro", "Moído para espresso"] },
  { id: "drip-10", nome: "Drip coffee, caixa com 10", p: 4500 },
  { id: "caneca", nome: "Caneca de cerâmica", p: 6900 },
  { id: "kit-presente", nome: "Kit presente (monte o seu)", p: null },
];

/** Variações de um item: tamanhos (cardápio) ou opções (loja). [] = item sem variação. */
export const variantes = (it) => Array.isArray(it.p) ? it.p.map(v => v[0]) : (it.opcoes || []);
/** Preço em centavos de um item numa variação (null = a consultar). */
export function precoDe(it, variante) {
  if (Array.isArray(it.p)) { const v = it.p.find(x => x[0] === variante); return v ? v[1] : undefined; }
  return it.p;
}
/** Acha um item: tipo "cardapio" ou "loja". */
export const achar = (tipo, id) => (tipo === "loja" ? LOJA : tipo === "cardapio" ? CARDAPIO : []).find(x => x.id === id) || null;
