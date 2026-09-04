# Luna v0.2 manual review

Only failures, mismatches, false inferences and invalid evidence are included. No chain-of-thought is stored.

## FVS-001
- **CATEGORY:** query_intent
- **CRITICAL:** true
- **MESSAGE:** ¿Qué cuota tiene?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"installment_offer","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"installment_offer","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m1","text":"¿Qué cuota tiene?","start":0,"end":16}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m1","text":"¿Qué cuota tiene?","start":0,"end":16}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","purchase_mode_statement"],"false_inferences":[]}`

## FVS-004
- **CATEGORY:** query_intent
- **CRITICAL:** true
- **MESSAGE:** solo decime la cuota
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"installment_offer","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"installment_offer","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m4","text":"solo decime la cuota","start":9,"end":25}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m4","text":"solo decime la cuota","start":0,"end":25}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","purchase_mode_statement"],"false_inferences":[]}`

## FVS-005
- **CATEGORY:** query_intent
- **CRITICAL:** true
- **MESSAGE:** y las cuotas?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"installment_offer","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"installment_offer","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m5","text":"y las cuotas?","start":3,"end":13}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m5","text":"y las cuotas?","start":0,"end":13}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","purchase_mode_statement"],"false_inferences":[]}`

## FVS-006
- **CATEGORY:** query_intent
- **CRITICAL:** true
- **MESSAGE:** ¿Cuánto sale de contado?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"model_value","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"model_value","purchase_mode_statement":"cash","purchase_mode_literal":"de contado","amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m6","text":"¿Cuánto sale de contado?","start":0,"end":24}],"purchase_mode_statement":[{"message_id":"m6","text":"¿Cuánto sale de contado?","start":13,"end":22}],"trade_in_intent":null,"human_request":[{"message_id":"m6","text":"¿Cuánto sale de contado?","start":0,"end":24}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","purchase_mode_statement"],"false_inferences":[]}`

## FVS-008
- **CATEGORY:** query_intent
- **CRITICAL:** true
- **MESSAGE:** cuanto vale
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"model_value","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"model_value","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"vehicle_role","evidence":[{"message_id":"m8","text":"cuanto vale","start":0,"end":10}]}],"evidence":{"query_intent":[{"message_id":"m8","text":"cuanto vale","start":0,"end":10}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m8","text":"cuanto vale","start":0,"end":10}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","purchase_mode_statement"],"false_inferences":[]}`

## FVS-009
- **CATEGORY:** query_intent
- **CRITICAL:** true
- **MESSAGE:** ¿Cuál es el valor del 208?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"model_value","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"model_value","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"208","brand_text":null,"model_text":"208","version_text":null,"role":"target","certainty":"explicit","evidence":[{"message_id":"m9","text":"¿Cuál es el valor del 208?","start":18,"end":21}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m9","text":"¿Cuál es el valor del 208?","start":0,"end":26}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m9","text":"¿Cuál es el valor del 208?","start":0,"end":26}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","purchase_mode_statement"],"false_inferences":[]}`

## FVS-010
- **CATEGORY:** query_intent
- **CRITICAL:** true
- **MESSAGE:** precio de la Tera?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"model_value","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"model_value","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Tera","brand_text":null,"model_text":"Tera","version_text":null,"role":"target","certainty":"explicit","evidence":[{"message_id":"m10","text":"precio de la Tera?","start":11,"end":15}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m10","text":"precio de la Tera?","start":0,"end":18}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","purchase_mode_statement"],"false_inferences":[]}`

## FVS-011
- **CATEGORY:** amounts
- **CRITICAL:** true
- **MESSAGE:** ¿Con cuánto puedo entrar?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"subscription_amount","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"unknown_amount","numeric_value":null,"currency":null,"literal":"¿Con cuánto puedo entrar?","certainty":"ambiguous","confirmation_recommended":true,"evidence":[{"message_id":"m11","text":"¿Con cuánto puedo entrar?","start":0,"end":25}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"initial_amount_intent","evidence":[{"message_id":"m11","text":"¿Con cuánto puedo entrar?","start":0,"end":25}]}],"evidence":{"query_intent":[{"message_id":"m11","text":"¿Con cuánto puedo entrar?","start":0,"end":25}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m11","text":"¿Con cuánto puedo entrar?","start":0,"end":25}],"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"unknown_amount","numeric_value":null,"currency":null,"literal":"¿Con cuánto puedo entrar?","certainty":"ambiguous","confirmation_recommended":true,"evidence":[{"message_id":"m11","text":"¿Con cuánto puedo entrar?","start":0,"end":25}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"initial_amount_intent","evidence":[{"message_id":"m11","text":"¿Con cuánto puedo entrar?","start":0,"end":25}]}],"evidence":{"query_intent":[{"message_id":"m11","text":"¿Con cuánto puedo entrar?","start":0,"end":25}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m11","text":"¿Con cuánto puedo entrar?","start":0,"end":25}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["query_intent"],"false_inferences":[]}`

## FVS-012
- **CATEGORY:** amounts
- **CRITICAL:** true
- **MESSAGE:** con cuanto entro al plan
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"subscription_amount","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"initial_amount_intent","evidence":[{"message_id":"m12","text":"con cuanto entro al plan","start":0,"end":24}]}],"evidence":{"query_intent":[{"message_id":"m12","text":"con cuanto entro al plan","start":0,"end":24}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m12","text":"con cuanto entro al plan","start":0,"end":24}],"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"initial_amount_intent","evidence":[{"message_id":"m12","text":"con cuanto entro al plan","start":0,"end":24}]}],"evidence":{"query_intent":[{"message_id":"m12","text":"con cuanto entro al plan","start":0,"end":24}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m12","text":"con cuanto entro al plan","start":0,"end":24}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["query_intent"],"false_inferences":[]}`

## FVS-014
- **CATEGORY:** amounts
- **CRITICAL:** true
- **MESSAGE:** con cuanto arranco el plan
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"subscription_amount","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"initial_amount_intent","evidence":[{"message_id":"m14","text":"con cuanto arranco el plan","start":0,"end":25}]}],"evidence":{"query_intent":[{"message_id":"m14","text":"con cuanto arranco el plan","start":0,"end":25}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m14","text":"con cuanto arranco el plan","start":0,"end":25}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","purchase_mode_statement"],"false_inferences":[]}`

## FVS-016
- **CATEGORY:** amounts
- **CRITICAL:** true
- **MESSAGE:** con cuanto lo saco
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"delivery_advance","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"initial_amount_intent","evidence":[{"message_id":"m16","text":"con cuanto lo saco","start":0,"end":17}]}],"evidence":{"query_intent":[{"message_id":"m16","text":"con cuanto lo saco","start":0,"end":17}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m16","text":"con cuanto lo saco","start":0,"end":17}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","purchase_mode_statement"],"false_inferences":[]}`

## FVS-017
- **CATEGORY:** amounts
- **CRITICAL:** true
- **MESSAGE:** ¿Qué anticipo necesito para retirarlo?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"delivery_advance","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"delivery_advance","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m17","text":"¿Qué anticipo necesito para retirarlo?","start":0,"end":32}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m17","text":"¿Qué anticipo necesito para retirarlo?","start":0,"end":32}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","purchase_mode_statement"],"false_inferences":[]}`

## FVS-018
- **CATEGORY:** amounts
- **CRITICAL:** true
- **MESSAGE:** cuanto pongo para sacar el auto
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"delivery_advance","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"initial_amount_intent","evidence":[{"message_id":"m18","text":"cuanto pongo para sacar el auto","start":0,"end":28}]}],"evidence":{"query_intent":[{"message_id":"m18","text":"cuanto pongo para sacar el auto","start":0,"end":28}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m18","text":"cuanto pongo para sacar el auto","start":0,"end":28}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","purchase_mode_statement"],"false_inferences":[]}`

## FVS-019
- **CATEGORY:** amounts
- **CRITICAL:** true
- **MESSAGE:** ¿Cuánto tengo que poner?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"ambiguous_initial_amount","needs_clarification.code":"initial_amount_intent"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"initial_amount_intent","evidence":[{"message_id":"m19","text":"¿Cuánto tengo que poner?","start":0,"end":22}]}],"evidence":{"query_intent":[{"message_id":"m19","text":"¿Cuánto tengo que poner?","start":0,"end":22}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m19","text":"¿Cuánto tengo que poner?","start":0,"end":22}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","needs_clarification.code"],"false_inferences":[]}`

## FVS-021
- **CATEGORY:** amounts
- **CRITICAL:** true
- **MESSAGE:** qué monto inicial necesito
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"ambiguous_initial_amount","needs_clarification.code":"initial_amount_intent"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"initial_amount_intent","evidence":[{"message_id":"m21","text":"qué monto inicial necesito","start":4,"end":25}]}],"evidence":{"query_intent":[{"message_id":"m21","text":"qué monto inicial necesito","start":0,"end":25}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent","needs_clarification.code"],"false_inferences":[]}`

## FVS-023
- **CATEGORY:** purchase_mode
- **CRITICAL:** false
- **MESSAGE:** Quiero hacerlo por crédito.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"purchase_mode_statement":"financed"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"financed","purchase_mode_literal":"por crédito","amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":[{"message_id":"m23","text":"Quiero hacerlo por crédito.","start":0,"end":26}],"trade_in_intent":null,"human_request":[{"message_id":"m23","text":"Quiero hacerlo por crédito.","start":0,"end":26}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["purchase_mode_statement"],"false_inferences":[]}`

## FVS-024
- **CATEGORY:** purchase_mode
- **CRITICAL:** false
- **MESSAGE:** Quiero entrar en un plan.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"purchase_mode_statement":"financed"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"subscription_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m24","text":"Quiero entrar en un plan.","start":0,"end":27}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m24","text":"Quiero entrar en un plan.","start":0,"end":27}],"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"subscription_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m24","text":"Quiero entrar en un plan.","start":0,"end":27}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m24","text":"Quiero entrar en un plan.","start":0,"end":27}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["purchase_mode_statement"],"false_inferences":[]}`

## FVS-025
- **CATEGORY:** purchase_mode
- **CRITICAL:** false
- **MESSAGE:** Lo compro al contado.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"purchase_mode_statement":"cash"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"general_information","purchase_mode_statement":"cash","purchase_mode_literal":"al contado","amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":[{"message_id":"m25","text":"Lo compro al contado.","start":0,"end":20}],"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["purchase_mode_statement"],"false_inferences":[]}`

## FVS-027
- **CATEGORY:** purchase_mode
- **CRITICAL:** false
- **MESSAGE:** ¿Qué financiación tienen?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"installment_offer","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m27","text":"¿Qué financiación tienen?","start":0,"end":23}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["purchase_mode_statement"],"false_inferences":[]}`

## FVS-029
- **CATEGORY:** purchase_mode
- **CRITICAL:** false
- **MESSAGE:** hay financiación?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"installment_offer","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m29","text":"hay financiación?","start":0,"end":16}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["purchase_mode_statement"],"false_inferences":[]}`

## FVS-030
- **CATEGORY:** purchase_mode
- **CRITICAL:** false
- **MESSAGE:** Lo quiero al contado pero también podría financiarlo.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"purchase_mode_statement":"conflicting","needs_clarification.code":"conflicting_purchase_mode"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"general_information","purchase_mode_statement":"conflicting","purchase_mode_literal":"al contado pero también podría financiarlo","amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"conflicting_purchase_mode","evidence":[{"message_id":"m30","text":"Lo quiero al contado pero también podría financiarlo.","start":11,"end":51}]}],"evidence":{"query_intent":[{"message_id":"m30","text":"Lo quiero al contado pero también podría financiarlo.","start":0,"end":52}],"purchase_mode_statement":[{"message_id":"m30","text":"Lo quiero al contado pero también podría financiarlo.","start":0,"end":52}],"trade_in_intent":null,"human_request":[{"message_id":"m30","text":"Lo quiero al contado pero también podría financiarlo.","start":0,"end":52}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["purchase_mode_statement","needs_clarification.code"],"false_inferences":[]}`

## FVS-031
- **CATEGORY:** amounts
- **CRITICAL:** false
- **MESSAGE:** Tengo diez millones para el anticipo.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"amount_mentions.kind":"down_payment_capacity","amount_mentions.numeric_value":10000000,"amount_mentions.literal":"diez millones"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"down_payment_capacity","numeric_value":10000000,"currency":null,"literal":"diez millones","certainty":"explicit","confirmation_recommended":true,"evidence":[{"message_id":"m31","text":"Tengo diez millones para el anticipo.","start":6,"end":18}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"amount_scale_or_currency","evidence":[{"message_id":"m31","text":"Tengo diez millones para el anticipo.","start":6,"end":18}]}],"evidence":{"query_intent":[{"message_id":"m31","text":"Tengo diez millones para el anticipo.","start":6,"end":18}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["amount_mentions.kind","amount_mentions.numeric_value","amount_mentions.literal"],"false_inferences":[]}`

## FVS-032
- **CATEGORY:** amounts
- **CRITICAL:** false
- **MESSAGE:** tengo diez palos para poner
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"amount_mentions.kind":"down_payment_capacity","amount_mentions.numeric_value":10000000,"amount_mentions.literal":"diez palos"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"down_payment_capacity","numeric_value":10000000,"currency":null,"literal":"diez palos","certainty":"ambiguous","confirmation_recommended":true,"evidence":[{"message_id":"m32","text":"tengo diez palos para poner","start":6,"end":17}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"amount_scale_or_currency","evidence":[{"message_id":"m32","text":"tengo diez palos para poner","start":6,"end":17}]},{"code":"initial_amount_intent","evidence":[{"message_id":"m32","text":"tengo diez palos para poner","start":0,"end":28}]}],"evidence":{"query_intent":[{"message_id":"m32","text":"tengo diez palos para poner","start":0,"end":28}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["amount_mentions.kind","amount_mentions.numeric_value","amount_mentions.literal"],"false_inferences":[]}`

## FVS-033
- **CATEGORY:** amounts
- **CRITICAL:** false
- **MESSAGE:** Cuento con $8.000.000 de anticipo.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"amount_mentions.kind":"down_payment_capacity","amount_mentions.numeric_value":8000000,"amount_mentions.literal":"$8.000.000"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"down_payment_capacity","numeric_value":8000000,"currency":"ARS","literal":"$8.000.000 de anticipo","certainty":"explicit","confirmation_recommended":false,"evidence":[{"message_id":"m33","text":"Cuento con $8.000.000 de anticipo.","start":10,"end":31}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m33","text":"Cuento con $8.000.000 de anticipo.","start":10,"end":31}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["amount_mentions.kind","amount_mentions.numeric_value","amount_mentions.literal"],"false_inferences":[]}`

## FVS-034
- **CATEGORY:** amounts
- **CRITICAL:** false
- **MESSAGE:** No tengo anticipo, cero.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"amount_mentions.kind":"down_payment_capacity","amount_mentions.numeric_value":0,"amount_mentions.literal":"cero"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"down_payment_capacity","numeric_value":0,"currency":null,"literal":"No tengo anticipo, cero","certainty":"explicit","confirmation_recommended":false,"evidence":[{"message_id":"m34","text":"No tengo anticipo, cero.","start":0,"end":24}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m34","text":"No tengo anticipo, cero.","start":0,"end":24}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"down_payment_capacity","numeric_value":0,"currency":null,"literal":"No tengo anticipo, cero","certainty":"explicit","confirmation_recommended":false,"evidence":[{"message_id":"m34","text":"No tengo anticipo, cero.","start":0,"end":24}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m34","text":"No tengo anticipo, cero.","start":0,"end":24}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["amount_mentions.literal"],"false_inferences":[]}`

## FVS-035
- **CATEGORY:** amounts
- **CRITICAL:** false
- **MESSAGE:** puedo pagar 500 lucas por mes
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"amount_mentions.kind":"monthly_installment_capacity","amount_mentions.numeric_value":500000}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"installment_offer","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"monthly_installment_capacity","numeric_value":500000,"currency":"ARS","literal":"500 lucas por mes","certainty":"explicit","confirmation_recommended":false,"evidence":[{"message_id":"m35","text":"puedo pagar 500 lucas por mes","start":12,"end":34}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m35","text":"puedo pagar 500 lucas por mes","start":0,"end":31}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["amount_mentions.kind","amount_mentions.numeric_value"],"false_inferences":[]}`

## FVS-037
- **CATEGORY:** amounts
- **CRITICAL:** false
- **MESSAGE:** Mi cuota posible es 600 mil.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"amount_mentions.kind":"monthly_installment_capacity","amount_mentions.numeric_value":600000}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"model_value","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"monthly_installment_capacity","numeric_value":600000,"currency":null,"literal":"600 mil","certainty":"explicit","confirmation_recommended":true,"evidence":[{"message_id":"m37","text":"Mi cuota posible es 600 mil.","start":19,"end":26}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"amount_scale_or_currency","evidence":[{"message_id":"m37","text":"Mi cuota posible es 600 mil.","start":19,"end":26}]}],"evidence":{"query_intent":[{"message_id":"m37","text":"Mi cuota posible es 600 mil.","start":3,"end":26}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m37","text":"Mi cuota posible es 600 mil.","start":0,"end":26}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["amount_mentions.kind","amount_mentions.numeric_value"],"false_inferences":[]}`

## FVS-038
- **CATEGORY:** amounts
- **CRITICAL:** true
- **MESSAGE:** Tengo 5.000 para entrar.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"amount_mentions.kind":"unknown_amount","amount_mentions.numeric_value":null,"amount_mentions.certainty":"ambiguous","needs_clarification.code":"amount_scale_or_currency"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"down_payment_capacity","numeric_value":5000,"currency":null,"literal":"5.000","certainty":"explicit","confirmation_recommended":true,"evidence":[{"message_id":"m38","text":"Tengo 5.000 para entrar.","start":6,"end":11}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"amount_scale_or_currency","evidence":[{"message_id":"m38","text":"Tengo 5.000 para entrar.","start":6,"end":11}]},{"code":"initial_amount_intent","evidence":[{"message_id":"m38","text":"Tengo 5.000 para entrar.","start":0,"end":23}]}],"evidence":{"query_intent":[{"message_id":"m38","text":"Tengo 5.000 para entrar.","start":0,"end":23}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m38","text":"Tengo 5.000 para entrar.","start":0,"end":23}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["amount_mentions.kind","amount_mentions.numeric_value","amount_mentions.certainty","needs_clarification.code"],"false_inferences":[]}`

## FVS-039
- **CATEGORY:** amounts
- **CRITICAL:** true
- **MESSAGE:** cuento con 7.500
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"amount_mentions.kind":"unknown_amount","amount_mentions.numeric_value":null,"amount_mentions.certainty":"ambiguous","needs_clarification.code":"amount_scale_or_currency"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"unknown_amount","numeric_value":7500,"currency":null,"literal":"7.500","certainty":"explicit","confirmation_recommended":true,"evidence":[{"message_id":"m39","text":"cuento con 7.500","start":10,"end":15}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"amount_scale_or_currency","evidence":[{"message_id":"m39","text":"cuento con 7.500","start":0,"end":15}]}],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["amount_mentions.kind","amount_mentions.numeric_value","amount_mentions.certainty","needs_clarification.code"],"false_inferences":[]}`

## FVS-040
- **CATEGORY:** amounts
- **CRITICAL:** true
- **MESSAGE:** puedo poner 10
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"amount_mentions.kind":"unknown_amount","amount_mentions.numeric_value":null,"amount_mentions.certainty":"ambiguous","needs_clarification.code":"amount_scale_or_currency"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"down_payment_capacity","numeric_value":10,"currency":null,"literal":"10","certainty":"ambiguous","confirmation_recommended":true,"evidence":[{"message_id":"m40","text":"puedo poner 10","start":11,"end":13}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"amount_scale_or_currency","evidence":[{"message_id":"m40","text":"puedo poner 10","start":11,"end":13}]}],"evidence":{"query_intent":[{"message_id":"m40","text":"puedo poner 10","start":0,"end":13}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m40","text":"puedo poner 10","start":0,"end":13}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["amount_mentions.kind","amount_mentions.numeric_value","amount_mentions.certainty","needs_clarification.code"],"false_inferences":[]}`

## FVS-041
- **CATEGORY:** amounts
- **CRITICAL:** false
- **MESSAGE:** $10 millones
- **RELEVANT CONTEXT:** `[{"id":"a1","role":"assistant","text":"¿Con cuánto contás para el anticipo?","created_at":"2026-09-04T14:59:00Z"}]`
- **EXPECTED:** `{"amount_mentions.kind":"down_payment_capacity","amount_mentions.numeric_value":10000000,"amount_mentions.certainty":"contextual"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"down_payment_capacity","numeric_value":10000000,"currency":null,"literal":"$10 millones","certainty":"explicit","confirmation_recommended":true,"evidence":[{"message_id":"m41","text":"$10 millones","start":0,"end":12}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"amount_scale_or_currency","evidence":[{"message_id":"m41","text":"$10 millones","start":0,"end":12}]}],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m41","text":"$10 millones","start":0,"end":12}],"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"down_payment_capacity","numeric_value":10000000,"currency":null,"literal":"$10 millones","certainty":"explicit","confirmation_recommended":true,"evidence":[{"message_id":"m41","text":"$10 millones","start":0,"end":12}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"amount_scale_or_currency","evidence":[{"message_id":"m41","text":"$10 millones","start":0,"end":12}]}],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m41","text":"$10 millones","start":0,"end":12}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["amount_mentions.certainty"],"false_inferences":[]}`

## FVS-043
- **CATEGORY:** vehicle_roles
- **CRITICAL:** false
- **MESSAGE:** Quiero una Tera.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.role":"target","vehicle_mentions.model_text":"Tera"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"model_value","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Tera","brand_text":null,"model_text":"Tera","version_text":null,"role":"target","certainty":"explicit","evidence":[{"message_id":"m43","text":"Quiero una Tera.","start":9,"end":13}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m43","text":"Quiero una Tera.","start":0,"end":15}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m43","text":"Quiero una Tera.","start":0,"end":15}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.role","vehicle_mentions.model_text"],"false_inferences":[]}`

## FVS-044
- **CATEGORY:** vehicle_roles
- **CRITICAL:** false
- **MESSAGE:** Me interesa la Amarok.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.role":"target","vehicle_mentions.model_text":"Amarok"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"model_value","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Amarok","brand_text":null,"model_text":"Amarok","version_text":null,"role":"target","certainty":"explicit","evidence":[{"message_id":"m44","text":"Me interesa la Amarok.","start":13,"end":20}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m44","text":"Me interesa la Amarok.","start":0,"end":23}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m44","text":"Me interesa la Amarok.","start":0,"end":23}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.role","vehicle_mentions.model_text"],"false_inferences":[]}`

## FVS-045
- **CATEGORY:** vehicle_roles
- **CRITICAL:** false
- **MESSAGE:** Busco un Peugeot 208.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.role":"target","vehicle_mentions.model_text":"208"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"model_value","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Peugeot 208","brand_text":"Peugeot","model_text":"208","version_text":null,"role":"target","certainty":"explicit","evidence":[{"message_id":"m45","text":"Busco un Peugeot 208.","start":9,"end":22}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m45","text":"Busco un Peugeot 208.","start":0,"end":22}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.role","vehicle_mentions.model_text"],"false_inferences":[]}`

## FVS-046
- **CATEGORY:** vehicle_roles
- **CRITICAL:** false
- **MESSAGE:** Quiero info de la Fiorino.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.role":"target","vehicle_mentions.model_text":"Fiorino"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"general_information","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Fiorino","brand_text":null,"model_text":"Fiorino","version_text":null,"role":"target","certainty":"explicit","evidence":[{"message_id":"m46","text":"Quiero info de la Fiorino.","start":15,"end":22}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m46","text":"Quiero info de la Fiorino.","start":0,"end":25}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.role","vehicle_mentions.model_text"],"false_inferences":[]}`

## FVS-047
- **CATEGORY:** vehicle_roles
- **CRITICAL:** true
- **MESSAGE:** Tera o Toro, estoy viendo.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.roles":["target_candidate","target_candidate"],"vehicle_mentions.models":["Tera","Toro"]}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"model_value","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Tera","brand_text":null,"model_text":"Tera","version_text":null,"role":"target_candidate","certainty":"explicit","evidence":[{"message_id":"m47","text":"Tera o Toro, estoy viendo.","start":0,"end":4}]},{"literal":"Toro","brand_text":null,"model_text":"Toro","version_text":null,"role":"target_candidate","certainty":"explicit","evidence":[{"message_id":"m47","text":"Tera o Toro, estoy viendo.","start":8,"end":12}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"multiple_target_models","evidence":[{"message_id":"m47","text":"Tera o Toro, estoy viendo.","start":0,"end":12}]}],"evidence":{"query_intent":[{"message_id":"m47","text":"Tera o Toro, estoy viendo.","start":0,"end":12}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.roles","vehicle_mentions.models"],"false_inferences":[]}`

## FVS-048
- **CATEGORY:** vehicle_roles
- **CRITICAL:** true
- **MESSAGE:** Quiero Toro o Fastback.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.roles":["target_candidate","target_candidate"],"vehicle_mentions.models":["Toro","Fastback"]}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"model_value","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Toro","brand_text":null,"model_text":"Toro","version_text":null,"role":"target_candidate","certainty":"explicit","evidence":[{"message_id":"m48","text":"Quiero Toro o Fastback.","start":7,"end":11}]},{"literal":"Fastback","brand_text":null,"model_text":"Fastback","version_text":null,"role":"target_candidate","certainty":"explicit","evidence":[{"message_id":"m48","text":"Quiero Toro o Fastback.","start":15,"end":23}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"multiple_target_models","evidence":[{"message_id":"m48","text":"Quiero Toro o Fastback.","start":7,"end":23}]}],"evidence":{"query_intent":[{"message_id":"m48","text":"Quiero Toro o Fastback.","start":0,"end":23}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m48","text":"Quiero Toro o Fastback.","start":0,"end":23}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.roles","vehicle_mentions.models"],"false_inferences":[]}`

## FVS-049
- **CATEGORY:** vehicle_roles
- **CRITICAL:** true
- **MESSAGE:** Estoy entre Tera y 2008.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.roles":["target_candidate","target_candidate"],"vehicle_mentions.models":["Tera","2008"]}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"general_information","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Tera","brand_text":null,"model_text":"Tera","version_text":null,"role":"target_candidate","certainty":"explicit","evidence":[{"message_id":"m49","text":"Estoy entre Tera y 2008.","start":10,"end":14}]},{"literal":"2008","brand_text":null,"model_text":"2008","version_text":null,"role":"target_candidate","certainty":"explicit","evidence":[{"message_id":"m49","text":"Estoy entre Tera y 2008.","start":17,"end":21}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"multiple_target_models","evidence":[{"message_id":"m49","text":"Estoy entre Tera y 2008.","start":0,"end":21}]},{"code":"cross_brand_target","evidence":[{"message_id":"m49","text":"Estoy entre Tera y 2008.","start":0,"end":21}]}],"evidence":{"query_intent":[{"message_id":"m49","text":"Estoy entre Tera y 2008.","start":0,"end":21}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m49","text":"Estoy entre Tera y 2008.","start":0,"end":21}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.roles","vehicle_mentions.models"],"false_inferences":[]}`

## FVS-050
- **CATEGORY:** vehicle_roles
- **CRITICAL:** true
- **MESSAGE:** Estoy viendo una Tera. ¿Es como la Toro?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.contains":[{"model_text":"Tera","role":"target"},{"model_text":"Toro","role":"comparison"}]}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"general_information","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Tera","brand_text":null,"model_text":"Tera","version_text":null,"role":"target","certainty":"explicit","evidence":[{"message_id":"m50","text":"Estoy viendo una Tera. ¿Es como la Toro?","start":12,"end":16}]},{"literal":"Toro","brand_text":null,"model_text":"Toro","version_text":null,"role":"comparison","certainty":"explicit","evidence":[{"message_id":"m50","text":"Estoy viendo una Tera. ¿Es como la Toro?","start":25,"end":29}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m50","text":"Estoy viendo una Tera. ¿Es como la Toro?","start":17,"end":41}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m50","text":"Estoy viendo una Tera. ¿Es como la Toro?","start":0,"end":41}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.contains"],"false_inferences":[]}`

## FVS-051
- **CATEGORY:** vehicle_roles
- **CRITICAL:** true
- **MESSAGE:** ¿La Tera es parecida a la Toro?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.contains":[{"model_text":"Toro","role":"comparison"}]}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"general_information","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Tera","brand_text":null,"model_text":"Tera","version_text":null,"role":"target_candidate","certainty":"explicit","evidence":[{"message_id":"m51","text":"¿La Tera es parecida a la Toro?","start":3,"end":7}]},{"literal":"Toro","brand_text":null,"model_text":"Toro","version_text":null,"role":"comparison","certainty":"explicit","evidence":[{"message_id":"m51","text":"¿La Tera es parecida a la Toro?","start":23,"end":27}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m51","text":"¿La Tera es parecida a la Toro?","start":0,"end":32}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m51","text":"¿La Tera es parecida a la Toro?","start":0,"end":32}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.contains"],"false_inferences":[]}`

## FVS-052
- **CATEGORY:** trade_in
- **CRITICAL:** true
- **MESSAGE:** Tengo una Amarok.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.role":"owned_only","trade_in_intent":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Amarok","brand_text":null,"model_text":"Amarok","version_text":null,"role":"owned_only","certainty":"explicit","evidence":[{"message_id":"m52","text":"Tengo una Amarok.","start":7,"end":13}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.role","trade_in_intent"],"false_inferences":[]}`

## FVS-053
- **CATEGORY:** trade_in
- **CRITICAL:** true
- **MESSAGE:** Yo ya tengo un Gol.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.role":"owned_only","trade_in_intent":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Gol","brand_text":null,"model_text":"Gol","version_text":null,"role":"owned_only","certainty":"explicit","evidence":[{"message_id":"m53","text":"Yo ya tengo un Gol.","start":14,"end":17}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.role","trade_in_intent"],"false_inferences":[]}`

## FVS-054
- **CATEGORY:** trade_in
- **CRITICAL:** true
- **MESSAGE:** Tengo una Toro en casa.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.role":"owned_only","trade_in_intent":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Toro","brand_text":null,"model_text":"Toro","version_text":null,"role":"owned_only","certainty":"explicit","evidence":[{"message_id":"m54","text":"Tengo una Toro en casa.","start":9,"end":13}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.role","trade_in_intent"],"false_inferences":[]}`

## FVS-055
- **CATEGORY:** trade_in
- **CRITICAL:** true
- **MESSAGE:** Tengo una Amarok para entregar.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.role":"trade_in","vehicle_mentions.model_text":"Amarok","trade_in_intent":"yes"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Amarok","brand_text":null,"model_text":"Amarok","version_text":null,"role":"trade_in","certainty":"explicit","evidence":[{"message_id":"m55","text":"Tengo una Amarok para entregar.","start":9,"end":16}]}],"trade_in_intent":"yes","trade_in_vehicle":{"brand":{"value":null,"status":"explicitly_unknown","evidence":[]},"model":{"value":"Amarok","status":"known","evidence":[{"message_id":"m55","text":"Tengo una Amarok para entregar.","start":9,"end":16}]},"version":{"value":null,"status":"explicitly_unknown","evidence":[]},"year":{"value":null,"status":"explicitly_unknown","evidence":[]},"mileage_km":{"value":null,"status":"explicitly_unknown","evidence":[]}},"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":[{"message_id":"m55","text":"Tengo una Amarok para entregar.","start":9,"end":32}],"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.role","vehicle_mentions.model_text","trade_in_intent"],"false_inferences":[]}`

## FVS-056
- **CATEGORY:** trade_in
- **CRITICAL:** true
- **MESSAGE:** la Amarok la entrego
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.role":"trade_in","vehicle_mentions.model_text":"Amarok","trade_in_intent":"yes"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"la Amarok","brand_text":null,"model_text":"Amarok","version_text":null,"role":"trade_in","certainty":"explicit","evidence":[{"message_id":"m56","text":"la Amarok la entrego","start":0,"end":9}]}],"trade_in_intent":"yes","trade_in_vehicle":{"brand":{"value":null,"status":"explicitly_unknown","evidence":[]},"model":{"value":"Amarok","status":"known","evidence":[{"message_id":"m56","text":"la Amarok la entrego","start":3,"end":9}]},"version":{"value":null,"status":"explicitly_unknown","evidence":[]},"year":{"value":null,"status":"explicitly_unknown","evidence":[]},"mileage_km":{"value":null,"status":"explicitly_unknown","evidence":[]}},"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":[{"message_id":"m56","text":"la Amarok la entrego","start":0,"end":21}],"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.role","vehicle_mentions.model_text","trade_in_intent"],"false_inferences":[]}`

## FVS-057
- **CATEGORY:** trade_in
- **CRITICAL:** true
- **MESSAGE:** Entrego un Gol Trend 2020 con 70.000 km.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"vehicle_mentions.role":"trade_in","vehicle_mentions.model_text":"Gol","trade_in_intent":"yes"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Gol Trend 2020","brand_text":null,"model_text":"Gol Trend","version_text":null,"role":"trade_in","certainty":"explicit","evidence":[{"message_id":"m57","text":"Entrego un Gol Trend 2020 con 70.000 km.","start":10,"end":27}]}],"trade_in_intent":"yes","trade_in_vehicle":{"brand":{"value":null,"status":"explicitly_unknown","evidence":[]},"model":{"value":"Gol Trend","status":"known","evidence":[{"message_id":"m57","text":"Entrego un Gol Trend 2020 con 70.000 km.","start":10,"end":19}]},"version":{"value":null,"status":"explicitly_unknown","evidence":[]},"year":{"value":2020,"status":"known","evidence":[{"message_id":"m57","text":"Entrego un Gol Trend 2020 con 70.000 km.","start":10,"end":27}]},"mileage_km":{"value":70000,"status":"known","evidence":[{"message_id":"m57","text":"Entrego un Gol Trend 2020 con 70.000 km.","start":10,"end":48}]}},"customer_name":null,"customer_location":null,"human_request":false,"strong_action":true,"requested_action":{"type":"other","time_expression":null,"certainty":"explicit","evidence":[{"message_id":"m57","text":"Entrego un Gol Trend 2020 con 70.000 km.","start":0,"end":8}]},"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":[{"message_id":"m57","text":"Entrego un Gol Trend 2020 con 70.000 km.","start":0,"end":8}],"human_request":null,"strong_action":[{"message_id":"m57","text":"Entrego un Gol Trend 2020 con 70.000 km.","start":0,"end":8}],"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["vehicle_mentions.role","vehicle_mentions.model_text","trade_in_intent"],"false_inferences":[]}`

## FVS-058
- **CATEGORY:** trade_in
- **CRITICAL:** false
- **MESSAGE:** Me la quedo.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"trade_in_intent":"no"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"other","evidence":[{"message_id":"m58","text":"Me la quedo.","start":null,"end":null}]}],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"other","evidence":[{"message_id":"m58","text":"Me la quedo.","start":null,"end":null}]}],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["trade_in_intent"],"false_inferences":[]}`

## FVS-059
- **CATEGORY:** trade_in
- **CRITICAL:** false
- **MESSAGE:** No la voy a entregar.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"trade_in_intent":"no"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"no","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":[{"message_id":"m59","text":"No la voy a entregar.","start":0,"end":20}],"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["trade_in_intent"],"false_inferences":[]}`

## FVS-060
- **CATEGORY:** trade_in
- **CRITICAL:** true
- **MESSAGE:** Sí, una Amarok.
- **RELEVANT CONTEXT:** `[{"id":"a3","role":"assistant","text":"¿Tenés un usado que quieras entregar como parte de pago?","created_at":"2026-09-04T14:59:00Z"}]`
- **EXPECTED:** `{"trade_in_intent":"yes","vehicle_mentions.role":"trade_in","vehicle_mentions.certainty":"contextual"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Amarok","brand_text":null,"model_text":"Amarok","version_text":null,"role":"trade_in","certainty":"contextual","evidence":[{"message_id":"m60","text":"Sí, una Amarok.","start":4,"end":11}]}],"trade_in_intent":"yes","trade_in_vehicle":{"brand":{"value":null,"status":"explicitly_unknown","evidence":[]},"model":{"value":"Amarok","status":"known","evidence":[{"message_id":"m60","text":"Sí, una Amarok.","start":4,"end":11}]},"version":{"value":null,"status":"explicitly_unknown","evidence":[]},"year":{"value":null,"status":"explicitly_unknown","evidence":[]},"mileage_km":{"value":null,"status":"explicitly_unknown","evidence":[]}},"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":[{"message_id":"m60","text":"Sí, una Amarok.","start":0,"end":15}],"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["trade_in_intent","vehicle_mentions.role","vehicle_mentions.certainty"],"false_inferences":[]}`

## FVS-061
- **CATEGORY:** trade_in
- **CRITICAL:** true
- **MESSAGE:** Sí, una Amarok.
- **RELEVANT CONTEXT:** `[{"id":"a4","role":"assistant","text":"¿Tenés un auto?","created_at":"2026-09-04T14:59:00Z"}]`
- **EXPECTED:** `{"trade_in_intent":"not_present","vehicle_mentions.role":"owned_only"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Amarok","brand_text":null,"model_text":"Amarok","version_text":null,"role":"unknown","certainty":"explicit","evidence":[{"message_id":"m61","text":"Sí, una Amarok.","start":4,"end":13}]}],"trade_in_intent":"ambiguous","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[{"code":"vehicle_role","evidence":[{"message_id":"m61","text":"Sí, una Amarok.","start":4,"end":13}]},{"code":"multiple_target_models","evidence":[{"message_id":"a4","text":"¿Tenés un auto?","start":8,"end":15},{"message_id":"m61","text":"Sí, una Amarok.","start":4,"end":13}]}],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":[{"message_id":"a4","text":"¿Tenés un auto?","start":8,"end":15},{"message_id":"m61","text":"Sí, una Amarok.","start":4,"end":13}],"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["trade_in_intent","vehicle_mentions.role"],"false_inferences":[]}`

## FVS-062
- **CATEGORY:** trade_in
- **CRITICAL:** false
- **MESSAGE:** No sé qué versión es.
- **RELEVANT CONTEXT:** `[{"id":"a3","role":"assistant","text":"¿Tenés un usado que quieras entregar como parte de pago?","created_at":"2026-09-04T14:59:00Z"}]`
- **EXPECTED:** `{"trade_in_vehicle.version.status":"explicitly_unknown"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"ambiguous","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":[{"message_id":"a3","text":"¿Tenés un usado que quieras entregar como parte de pago?","start":0,"end":58}],"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"ambiguous","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":[{"message_id":"a3","text":"¿Tenés un usado que quieras entregar como parte de pago?","start":0,"end":58}],"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["trade_in_vehicle.version.status"],"false_inferences":[]}`

## FVS-063
- **CATEGORY:** human_request
- **CRITICAL:** true
- **MESSAGE:** Quiero hablar con una persona.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"human_request":true}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m63","text":"Quiero hablar con una persona.","start":0,"end":28}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["human_request"],"false_inferences":[]}`

## FVS-066
- **CATEGORY:** human_request
- **CRITICAL:** true
- **MESSAGE:** Quiero verificarlo con alguien.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"human_request":true}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m66","text":"Quiero verificarlo con alguien.","start":0,"end":30}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["human_request"],"false_inferences":[]}`

## FVS-070
- **CATEGORY:** strong_action
- **CRITICAL:** true
- **MESSAGE:** Quiero señarlo ahora.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"strong_action":true,"requested_action.type":"deposit","requested_action.time_expression":"ahora"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":true,"requested_action":{"type":"deposit","time_expression":"ahora","certainty":"explicit","evidence":[{"message_id":"m70","text":"Quiero señarlo ahora.","start":8,"end":13}]},"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m70","text":"Quiero señarlo ahora.","start":0,"end":23}],"strong_action":[{"message_id":"m70","text":"Quiero señarlo ahora.","start":0,"end":23}],"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["strong_action","requested_action.type","requested_action.time_expression"],"false_inferences":[]}`

## FVS-071
- **CATEGORY:** strong_action
- **CRITICAL:** true
- **MESSAGE:** Tengo los papeles listos y quiero avanzar.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"strong_action":true,"requested_action.type":"documents","requested_action.time_expression":null}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":true,"requested_action":{"type":"other","time_expression":null,"certainty":"explicit","evidence":[{"message_id":"m71","text":"Tengo los papeles listos y quiero avanzar.","start":23,"end":39}]},"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m71","text":"Tengo los papeles listos y quiero avanzar.","start":0,"end":44}],"strong_action":[{"message_id":"m71","text":"Tengo los papeles listos y quiero avanzar.","start":23,"end":44}],"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["strong_action","requested_action.type","requested_action.time_expression"],"false_inferences":[]}`

## FVS-072
- **CATEGORY:** contact_timing
- **CRITICAL:** true
- **MESSAGE:** que me llamen el sabado
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"contact_preference_expression.literal":"el sabado","requested_action":null}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":{"literal":"que me llamen el sabado","certainty":"explicit","evidence":[{"message_id":"m72","text":"que me llamen el sabado","start":0,"end":25}]},"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m72","text":"que me llamen el sabado","start":0,"end":25}],"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":{"literal":"que me llamen el sabado","certainty":"explicit","evidence":[{"message_id":"m72","text":"que me llamen el sabado","start":0,"end":25}]},"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m72","text":"que me llamen el sabado","start":0,"end":25}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["contact_preference_expression.literal"],"false_inferences":[]}`

## FVS-073
- **CATEGORY:** contact_timing
- **CRITICAL:** false
- **MESSAGE:** Llamame ahora.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"contact_preference_expression.literal":"ahora"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":{"literal":"Llamame ahora.","certainty":"explicit","evidence":[{"message_id":"m73","text":"Llamame ahora.","start":0,"end":14}]},"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m73","text":"Llamame ahora.","start":0,"end":14}],"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":{"literal":"Llamame ahora.","certainty":"explicit","evidence":[{"message_id":"m73","text":"Llamame ahora.","start":0,"end":14}]},"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m73","text":"Llamame ahora.","start":0,"end":14}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["contact_preference_expression.literal"],"false_inferences":[]}`

## FVS-074
- **CATEGORY:** contact_timing
- **CRITICAL:** false
- **MESSAGE:** Hoy a la tarde me sirve.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"contact_preference_expression.literal":"Hoy a la tarde"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":{"literal":"Hoy a la tarde me sirve.","certainty":"explicit","evidence":[{"message_id":"m74","text":"Hoy a la tarde me sirve.","start":0,"end":25}]},"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":{"literal":"Hoy a la tarde me sirve.","certainty":"explicit","evidence":[{"message_id":"m74","text":"Hoy a la tarde me sirve.","start":0,"end":25}]},"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["contact_preference_expression.literal"],"false_inferences":[]}`

## FVS-075
- **CATEGORY:** contact_timing
- **CRITICAL:** false
- **MESSAGE:** Mañana después de las 17.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"contact_preference_expression.literal":"Mañana después de las 17"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":{"literal":"Mañana después de las 17.","certainty":"explicit","evidence":[{"message_id":"m75","text":"Mañana después de las 17.","start":0,"end":25}]},"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":{"literal":"Mañana después de las 17.","certainty":"explicit","evidence":[{"message_id":"m75","text":"Mañana después de las 17.","start":0,"end":25}]},"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["contact_preference_expression.literal"],"false_inferences":[]}`

## FVS-076
- **CATEGORY:** contact_timing
- **CRITICAL:** false
- **MESSAGE:** La semana que viene.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"contact_preference_expression.literal":"La semana que viene"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["contact_preference_expression.literal"],"false_inferences":[]}`

## FVS-079
- **CATEGORY:** DNC
- **CRITICAL:** true
- **MESSAGE:** Bórrenme.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"do_not_contact":true}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":true,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":[{"message_id":"m79","text":"Bórrenme.","start":0,"end":8}]}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["do_not_contact"],"false_inferences":[]}`

## FVS-081
- **CATEGORY:** corrections
- **CRITICAL:** true
- **MESSAGE:** En realidad quiero Amarok.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"customer_corrections.field":"target_model","customer_corrections.to_literal":"Amarok","purchase_mode_statement":"not_present"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"model_value","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Amarok","brand_text":null,"model_text":"Amarok","version_text":null,"role":"target","certainty":"explicit","evidence":[{"message_id":"m81","text":"En realidad quiero Amarok.","start":21,"end":28}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[{"field":"target_model","from_literal":"Tera","to_literal":"Amarok","evidence":[{"message_id":"m81","text":"En realidad quiero Amarok.","start":0,"end":28}]}],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m81","text":"En realidad quiero Amarok.","start":0,"end":28}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m81","text":"En realidad quiero Amarok.","start":0,"end":28}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["customer_corrections.field","customer_corrections.to_literal","purchase_mode_statement"],"false_inferences":[]}`

## FVS-082
- **CATEGORY:** corrections
- **CRITICAL:** true
- **MESSAGE:** No, no quiero la Tera. Quiero Amarok.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"customer_corrections.field":"target_model","customer_corrections.from_literal":"Tera","customer_corrections.to_literal":"Amarok"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"general_information","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Tera","brand_text":null,"model_text":"Tera","version_text":null,"role":"target_candidate","certainty":"explicit","evidence":[{"message_id":"m82","text":"No, no quiero la Tera. Quiero Amarok.","start":17,"end":21}]},{"literal":"Amarok","brand_text":"Volkswagen","model_text":"Amarok","version_text":null,"role":"target","certainty":"explicit","evidence":[{"message_id":"m82","text":"No, no quiero la Tera. Quiero Amarok.","start":31,"end":37}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[{"field":"target_model","from_literal":"Tera","to_literal":"Amarok","evidence":[{"message_id":"m82","text":"No, no quiero la Tera. Quiero Amarok.","start":0,"end":37}]}],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m82","text":"No, no quiero la Tera. Quiero Amarok.","start":31,"end":37}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m82","text":"No, no quiero la Tera. Quiero Amarok.","start":0,"end":37}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["customer_corrections.field","customer_corrections.from_literal","customer_corrections.to_literal"],"false_inferences":[]}`

## FVS-083
- **CATEGORY:** corrections
- **CRITICAL:** false
- **MESSAGE:** No, son dólares.
- **RELEVANT CONTEXT:** `[{"id":"a1","role":"assistant","text":"¿Con cuánto contás para el anticipo?","created_at":"2026-09-04T14:59:00Z"}]`
- **EXPECTED:** `{"customer_corrections.field":"amount_currency","customer_corrections.to_literal":"dólares"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"ambiguous_initial_amount","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[{"kind":"down_payment_capacity","numeric_value":null,"currency":"USD","literal":"dólares","certainty":"explicit","confirmation_recommended":true,"evidence":[{"message_id":"m83","text":"No, son dólares.","start":4,"end":17}]}],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[{"field":"amount_currency","from_literal":null,"to_literal":"dólares","evidence":[{"message_id":"m83","text":"No, son dólares.","start":4,"end":17}]}],"needs_clarification":[{"code":"initial_amount_intent","evidence":[{"message_id":"a1","text":"¿Con cuánto contás para el anticipo?","start":14,"end":21}]},{"code":"amount_scale_or_currency","evidence":[{"message_id":"m83","text":"No, son dólares.","start":4,"end":17}]}],"evidence":{"query_intent":[{"message_id":"a1","text":"¿Con cuánto contás para el anticipo?","start":0,"end":37}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["customer_corrections.field","customer_corrections.to_literal"],"false_inferences":[]}`

## FVS-086
- **CATEGORY:** optional_fields
- **CRITICAL:** false
- **MESSAGE:** Soy César.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"customer_name.value":"César"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":{"value":"César","certainty":"explicit","evidence":[{"message_id":"m86","text":"Soy César.","start":4,"end":9}]},"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["customer_name.value"],"false_inferences":[]}`

## FVS-087
- **CATEGORY:** optional_fields
- **CRITICAL:** false
- **MESSAGE:** Me llamo Ana.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"customer_name.value":"Ana"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":{"value":"Ana","certainty":"explicit","evidence":[{"message_id":"m87","text":"Me llamo Ana.","start":11,"end":14}]},"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["customer_name.value"],"false_inferences":[]}`

## FVS-088
- **CATEGORY:** optional_fields
- **CRITICAL:** false
- **MESSAGE:** Estoy en Rosario.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"customer_location.value":"Rosario"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":{"value":"Rosario","certainty":"explicit","evidence":[{"message_id":"m88","text":"Estoy en Rosario.","start":9,"end":16}]},"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["customer_location.value"],"false_inferences":[]}`

## FVS-089
- **CATEGORY:** optional_fields
- **CRITICAL:** false
- **MESSAGE:** Soy de Viedma.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"customer_location.value":"Viedma"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":{"value":"Viedma","certainty":"explicit","evidence":[{"message_id":"m89","text":"Soy de Viedma.","start":7,"end":13}]},"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["customer_location.value"],"false_inferences":[]}`

## FVS-090
- **CATEGORY:** optional_fields
- **CRITICAL:** false
- **MESSAGE:** Vivo en Córdoba capital.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"customer_location.value":"Córdoba capital"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":{"value":"Córdoba capital","certainty":"explicit","evidence":[{"message_id":"m90","text":"Vivo en Córdoba capital.","start":8,"end":24}]},"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["customer_location.value"],"false_inferences":[]}`

## FVS-091
- **CATEGORY:** query_intent
- **CRITICAL:** false
- **MESSAGE:** ¿Qué motor trae la Tera?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"technical_question"}`
- **ACTUAL:** `null`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"technical_question","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[{"literal":"Tera","brand_text":null,"model_text":"Tera","version_text":null,"role":"target","certainty":"explicit","evidence":[{"message_id":"m91","text":"¿Qué motor trae la Tera?","start":18,"end":22}]}],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m91","text":"¿Qué motor trae la Tera?","start":0,"end":24}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `["INVALID_OR_MISSING_EVIDENCE"]`
- **MISMATCH:** `{"fields":["query_intent"],"false_inferences":[]}`

## FVS-092
- **CATEGORY:** query_intent
- **CRITICAL:** false
- **MESSAGE:** ¿Es una pick-up?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"technical_question"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"general_information","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m92","text":"¿Es una pick-up?","start":0,"end":16}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m92","text":"¿Es una pick-up?","start":0,"end":16}],"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"general_information","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m92","text":"¿Es una pick-up?","start":0,"end":16}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m92","text":"¿Es una pick-up?","start":0,"end":16}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["query_intent"],"false_inferences":[]}`

## FVS-093
- **CATEGORY:** query_intent
- **CRITICAL:** false
- **MESSAGE:** ¿Qué equipamiento tiene?
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"technical_question"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"general_information","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m93","text":"¿Qué equipamiento tiene?","start":0,"end":24}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m93","text":"¿Qué equipamiento tiene?","start":0,"end":24}],"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"general_information","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":true,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":[{"message_id":"m93","text":"¿Qué equipamiento tiene?","start":0,"end":24}],"purchase_mode_statement":null,"trade_in_intent":null,"human_request":[{"message_id":"m93","text":"¿Qué equipamiento tiene?","start":0,"end":24}],"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["query_intent"],"false_inferences":[]}`

## FVS-095
- **CATEGORY:** query_intent
- **CRITICAL:** false
- **MESSAGE:** Hola.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"general_information"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["query_intent"],"false_inferences":[]}`

## FVS-097
- **CATEGORY:** query_intent
- **CRITICAL:** false
- **MESSAGE:** Buenas, vi un anuncio.
- **RELEVANT CONTEXT:** `[]`
- **EXPECTED:** `{"query_intent":"general_information"}`
- **ACTUAL:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **RAW_STRUCTURED_OUTPUT:** `{"schema_version":"filter-v1-semantic-extractor/1.0","query_intent":"none","purchase_mode_statement":"not_present","purchase_mode_literal":null,"amount_mentions":[],"vehicle_mentions":[],"trade_in_intent":"not_present","trade_in_vehicle":null,"customer_name":null,"customer_location":null,"human_request":false,"strong_action":false,"requested_action":null,"contact_preference_expression":null,"do_not_contact":false,"customer_corrections":[],"needs_clarification":[],"evidence":{"query_intent":null,"purchase_mode_statement":null,"trade_in_intent":null,"human_request":null,"strong_action":null,"do_not_contact":null}}`
- **LOCAL_VALIDATION_ERROR:** `[]`
- **MISMATCH:** `{"fields":["query_intent"],"false_inferences":[]}`
