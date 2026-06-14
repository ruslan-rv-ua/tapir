/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Help_TitleInputs */

const uk_help_title = /** @type {(inputs: Help_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Довідка Tapir`)
};

const en_help_title = /** @type {(inputs: Help_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Tapir Help`)
};

/**
* | output |
* | --- |
* | "Tapir Help" |
*
* @param {Help_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const help_title = /** @type {((inputs?: Help_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Help_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_help_title(inputs)
	return en_help_title(inputs)
});