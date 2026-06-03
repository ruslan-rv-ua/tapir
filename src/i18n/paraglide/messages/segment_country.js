/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_CountryInputs */

const uk_segment_country = /** @type {(inputs: Segment_CountryInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`країна`)
};

const en_segment_country = /** @type {(inputs: Segment_CountryInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`country`)
};

/**
* | output |
* | --- |
* | "country" |
*
* @param {Segment_CountryInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_country = /** @type {((inputs?: Segment_CountryInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_CountryInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_country(inputs)
	return en_segment_country(inputs)
});