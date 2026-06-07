/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profiles_SectionInputs */

const uk_profiles_section = /** @type {(inputs: Profiles_SectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Профілі`)
};

const en_profiles_section = /** @type {(inputs: Profiles_SectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Profiles`)
};

/**
* | output |
* | --- |
* | "Profiles" |
*
* @param {Profiles_SectionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profiles_section = /** @type {((inputs?: Profiles_SectionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profiles_SectionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profiles_section(inputs)
	return en_profiles_section(inputs)
});