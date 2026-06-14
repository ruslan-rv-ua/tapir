/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Help_Sections_LabelInputs */

const uk_help_sections_label = /** @type {(inputs: Help_Sections_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Розділи довідки`)
};

const en_help_sections_label = /** @type {(inputs: Help_Sections_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Help sections`)
};

/**
* | output |
* | --- |
* | "Help sections" |
*
* @param {Help_Sections_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const help_sections_label = /** @type {((inputs?: Help_Sections_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Help_Sections_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_help_sections_label(inputs)
	return en_help_sections_label(inputs)
});