/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_Free_DiskInputs */

const uk_segment_free_disk = /** @type {(inputs: Segment_Free_DiskInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Вільне місце`)
};

const en_segment_free_disk = /** @type {(inputs: Segment_Free_DiskInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Free disk`)
};

/**
* | output |
* | --- |
* | "Free disk" |
*
* @param {Segment_Free_DiskInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_free_disk = /** @type {((inputs?: Segment_Free_DiskInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_Free_DiskInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_free_disk(inputs)
	return en_segment_free_disk(inputs)
});