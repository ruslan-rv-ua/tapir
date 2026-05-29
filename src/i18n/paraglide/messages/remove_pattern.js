/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Remove_PatternInputs */

const uk_remove_pattern = /** @type {(inputs: Remove_PatternInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Видалити патерн`)
};

const en_remove_pattern = /** @type {(inputs: Remove_PatternInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Remove pattern`)
};

/**
* | output |
* | --- |
* | "Remove pattern" |
*
* @param {Remove_PatternInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const remove_pattern = /** @type {((inputs?: Remove_PatternInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Remove_PatternInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_remove_pattern(inputs)
	return en_remove_pattern(inputs)
});