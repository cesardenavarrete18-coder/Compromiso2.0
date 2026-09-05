# IA Comercial V2 — baseline real de V1

## Cohorte

`COHORT=100 conversaciones recientes con actividad V1 real.`

| Métrica | Resultado |
|---|---:|
| CONVERSATIONS | 100 |
| CUSTOMER_MESSAGES | 231 |
| AI_MESSAGES | 241 |
| QUALIFIED | 44 |
| FOLLOW_UP | 51 |
| UNQUALIFIED | 5 |
| QUALIFIED_WITH_CUSTOMER_MESSAGE_AFTER_HANDOFF_AND_NO_RECORDED_OUTBOUND_OVER_2H | 28 |
| EXPLICIT_PRICE_REQUESTS | 9 |
| PRICE_REQUESTS_WITH_AI_REPLY | 8 |
| PRICE_REPLIES_WITHOUT_NUMERIC_PRICE | 5 |
| CLEAR_REJECTION_MESSAGES | 3 |
| REJECTIONS_FOLLOWED_BY_ANOTHER_AI_QUESTION | 2 |
| AI_MESSAGES_WITH_2PLUS_QUESTIONS | 5 |
| AFFECTED_CONVERSATIONS | 3 |
| WRONG_BRAND_PARTNER_OCCURRENCES | 2 |

## Hallazgo: `V1_STRUCTURED_FACT_MISMATCH`

Hallazgo operativo para diseño y medición; no constituye una acusación legal. Los datos estructurados observados fueron:

- Peugeot 208 Plan 70/30: `advance=11871000`, `installment=431250`, `final_price=40370000`.
- Peugeot 208 Plan 80/20: `advance=7914000`, `installment=468500`, `final_price=40370000`.
- Peugeot 208 Plan 100%: `advance=4161000`, `installment=655427`, `final_price=42450000`.
- Peugeot Partner: `advance=12300000`, `installment=507674`, `final_price=41860000`.

En la cohorte V1 hubo 17 mensajes del 208 con 320000/400000 por debajo de los valores estructurados actuales, 31 mensajes de Partner usando 500000 y 23 usando 12000000. También aparecieron afirmaciones de tasa 0, descuentos monetarios y disponibilidad. En V2 esos datos variables sólo pueden proceder de facts estructurados autorizados; V1 no se modifica en esta etapa.
