/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ label: NonNullable<unknown>, count: NonNullable<unknown> }} Streams_Filter_Changed_OneInputs */

const uk_streams_filter_changed_one = /** @type {(inputs: Streams_Filter_Changed_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Фільтр «${i?.label}»: ${i?.count} потік`)
};

const en_streams_filter_changed_one = /** @type {(inputs: Streams_Filter_Changed_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Filter «${i?.label}»: ${i?.count} stream`)
};

/**
* | output |
* | --- |
* | "Filter «{label}»: {count} stream" |
*
* @param {Streams_Filter_Changed_OneInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_filter_changed_one = /** @type {((inputs: Streams_Filter_Changed_OneInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Filter_Changed_OneInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_filter_changed_one(inputs)
	return en_streams_filter_changed_one(inputs)
});