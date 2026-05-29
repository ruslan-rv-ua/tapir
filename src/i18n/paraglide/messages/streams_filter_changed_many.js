/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ label: NonNullable<unknown>, count: NonNullable<unknown> }} Streams_Filter_Changed_ManyInputs */

const uk_streams_filter_changed_many = /** @type {(inputs: Streams_Filter_Changed_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Фільтр «${i?.label}»: ${i?.count} потоків`)
};

const en_streams_filter_changed_many = /** @type {(inputs: Streams_Filter_Changed_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Filter «${i?.label}»: ${i?.count} streams`)
};

/**
* | output |
* | --- |
* | "Filter «{label}»: {count} streams" |
*
* @param {Streams_Filter_Changed_ManyInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_filter_changed_many = /** @type {((inputs: Streams_Filter_Changed_ManyInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Filter_Changed_ManyInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_filter_changed_many(inputs)
	return en_streams_filter_changed_many(inputs)
});