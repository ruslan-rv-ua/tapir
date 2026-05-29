/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Column_PatternInputs */

const uk_column_pattern = /** @type {(inputs: Column_PatternInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Патерн`)
};

const en_column_pattern = /** @type {(inputs: Column_PatternInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Pattern`)
};

/**
* | output |
* | --- |
* | "Pattern" |
*
* @param {Column_PatternInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const column_pattern = /** @type {((inputs?: Column_PatternInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Column_PatternInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_column_pattern(inputs)
	return en_column_pattern(inputs)
});