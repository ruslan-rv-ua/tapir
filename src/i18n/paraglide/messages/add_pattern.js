/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Add_PatternInputs */

const uk_add_pattern = /** @type {(inputs: Add_PatternInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Додати патерн`)
};

const en_add_pattern = /** @type {(inputs: Add_PatternInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Add pattern`)
};

/**
* | output |
* | --- |
* | "Add pattern" |
*
* @param {Add_PatternInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const add_pattern = /** @type {((inputs?: Add_PatternInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Add_PatternInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_add_pattern(inputs)
	return en_add_pattern(inputs)
});