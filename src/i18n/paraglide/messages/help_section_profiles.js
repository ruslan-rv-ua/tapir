/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Help_Section_ProfilesInputs */

const uk_help_section_profiles = /** @type {(inputs: Help_Section_ProfilesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Профілі`)
};

const en_help_section_profiles = /** @type {(inputs: Help_Section_ProfilesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Profiles`)
};

/**
* | output |
* | --- |
* | "Profiles" |
*
* @param {Help_Section_ProfilesInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const help_section_profiles = /** @type {((inputs?: Help_Section_ProfilesInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Help_Section_ProfilesInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_help_section_profiles(inputs)
	return en_help_section_profiles(inputs)
});