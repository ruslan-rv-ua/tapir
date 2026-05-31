/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ label: NonNullable<unknown>, count: NonNullable<unknown> }} Streams_Filter_Chip_CountInputs */

const uk_streams_filter_chip_count = /** @type {(inputs: Streams_Filter_Chip_CountInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.label}, ${i?.count}`)
};

const en_streams_filter_chip_count = /** @type {(inputs: Streams_Filter_Chip_CountInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.label}, ${i?.count}`)
};

/**
* | output |
* | --- |
* | "{label}, {count}" |
*
* @param {Streams_Filter_Chip_CountInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_filter_chip_count = /** @type {((inputs: Streams_Filter_Chip_CountInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Filter_Chip_CountInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_filter_chip_count(inputs)
	return en_streams_filter_chip_count(inputs)
});