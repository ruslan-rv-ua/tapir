/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Pattern_LabelInputs */

const uk_pattern_label = /** @type {(inputs: Pattern_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Патерн`)
};

const en_pattern_label = /** @type {(inputs: Pattern_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Pattern`)
};

/**
* | output |
* | --- |
* | "Pattern" |
*
* @param {Pattern_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const pattern_label = /** @type {((inputs?: Pattern_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Pattern_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_pattern_label(inputs)
	return en_pattern_label(inputs)
});