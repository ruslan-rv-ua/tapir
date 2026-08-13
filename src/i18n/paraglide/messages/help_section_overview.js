/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Help_Section_OverviewInputs */

const uk_help_section_overview = /** @type {(inputs: Help_Section_OverviewInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Огляд і перші кроки`)
};

const en_help_section_overview = /** @type {(inputs: Help_Section_OverviewInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Overview & first steps`)
};

/**
* | output |
* | --- |
* | "Overview & first steps" |
*
* @param {Help_Section_OverviewInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const help_section_overview = /** @type {((inputs?: Help_Section_OverviewInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Help_Section_OverviewInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_help_section_overview(inputs)
	return en_help_section_overview(inputs)
});