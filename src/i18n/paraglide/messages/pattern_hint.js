/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Pattern_HintInputs */

const uk_pattern_hint = /** @type {(inputs: Pattern_HintInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Використовуйте * для будь-яких символів, ? для одного`)
};

const en_pattern_hint = /** @type {(inputs: Pattern_HintInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Use * for any characters, ? for one character`)
};

/**
* | output |
* | --- |
* | "Use * for any characters, ? for one character" |
*
* @param {Pattern_HintInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const pattern_hint = /** @type {((inputs?: Pattern_HintInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Pattern_HintInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_pattern_hint(inputs)
	return en_pattern_hint(inputs)
});