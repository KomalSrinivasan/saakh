import { test } from "node:test";
import assert from "node:assert/strict";
import { nameSimilarity, translit } from "./names.ts";

test("translit: Devanagari to folded Latin, honorifics and relation words stripped", () => {
  assert.equal(translit("श्री रामप्रसाद पटेल"), "ramprasad patel");
  assert.equal(translit("Smt. Kamla Bai"), "kamla bai");
  assert.equal(translit("सांवेर"), translit("Sanwer"));
  assert.equal(translit("विठ्ठल"), translit("Vitthal"));
  assert.equal(translit("Ramesh s/o Mohan"), "rames mohan");
});

test("nameSimilarity across scripts and spellings", () => {
  assert.ok(nameSimilarity("रामप्रसाद पटेल", "Ramprasad Patel") >= 0.9);
  assert.ok(nameSimilarity("Vitthal Gaikwad", "विठ्ठल गायकवाड") >= 0.85);
  assert.ok(nameSimilarity("Ramesh Patidar", "Mohan Lal Meena") < 0.4);
  assert.equal(nameSimilarity("Patel Ramesh", "Ramesh Patel"), 1);
  assert.ok(nameSimilarity("R. Patel", "Ramesh Patel") >= 0.85);
  assert.ok(nameSimilarity("Ramesh Patel", "Ramesh Mohan Patel") >= 0.85);
  assert.ok(nameSimilarity("Ramesh Patel", "रामप्रसाद पटेल") < 0.85);
  assert.equal(nameSimilarity("", "Ramesh"), 0);
});
