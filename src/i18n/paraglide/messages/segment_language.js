/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_LanguageInputs */

const uk_segment_language = /** @type {(inputs: Segment_LanguageInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`мова`)
};

const en_segment_language = /** @type {(inputs: Segment_LanguageInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`language`)
};

/**
* | output |
* | --- |
* | "language" |
*
* @param {Segment_LanguageInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_language = /** @type {((inputs?: Segment_LanguageInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_LanguageInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_language(inputs)
	return en_segment_language(inputs)
});