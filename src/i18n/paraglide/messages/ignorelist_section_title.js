/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Ignorelist_Section_TitleInputs */

const uk_ignorelist_section_title = /** @type {(inputs: Ignorelist_Section_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Ігноровані треки`)
};

const en_ignorelist_section_title = /** @type {(inputs: Ignorelist_Section_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Ignored tracks`)
};

/**
* | output |
* | --- |
* | "Ignored tracks" |
*
* @param {Ignorelist_Section_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const ignorelist_section_title = /** @type {((inputs?: Ignorelist_Section_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Ignorelist_Section_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_ignorelist_section_title(inputs)
	return en_ignorelist_section_title(inputs)
});