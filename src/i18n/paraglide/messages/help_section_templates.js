/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Help_Section_TemplatesInputs */

const uk_help_section_templates = /** @type {(inputs: Help_Section_TemplatesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Шаблони`)
};

const en_help_section_templates = /** @type {(inputs: Help_Section_TemplatesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Templates`)
};

/**
* | output |
* | --- |
* | "Templates" |
*
* @param {Help_Section_TemplatesInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const help_section_templates = /** @type {((inputs?: Help_Section_TemplatesInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Help_Section_TemplatesInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_help_section_templates(inputs)
	return en_help_section_templates(inputs)
});