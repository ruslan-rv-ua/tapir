/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_MetadataInputs */

const uk_segment_metadata = /** @type {(inputs: Segment_MetadataInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Метадані`)
};

const en_segment_metadata = /** @type {(inputs: Segment_MetadataInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Metadata`)
};

/**
* | output |
* | --- |
* | "Metadata" |
*
* @param {Segment_MetadataInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_metadata = /** @type {((inputs?: Segment_MetadataInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_MetadataInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_metadata(inputs)
	return en_segment_metadata(inputs)
});