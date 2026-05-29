/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ label: NonNullable<unknown> }} Streams_Filter_Changed_ZeroInputs */

const uk_streams_filter_changed_zero = /** @type {(inputs: Streams_Filter_Changed_ZeroInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Фільтр «${i?.label}»: нічого не знайдено`)
};

const en_streams_filter_changed_zero = /** @type {(inputs: Streams_Filter_Changed_ZeroInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Filter «${i?.label}»: no matches`)
};

/**
* | output |
* | --- |
* | "Filter «{label}»: no matches" |
*
* @param {Streams_Filter_Changed_ZeroInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_filter_changed_zero = /** @type {((inputs: Streams_Filter_Changed_ZeroInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Filter_Changed_ZeroInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_filter_changed_zero(inputs)
	return en_streams_filter_changed_zero(inputs)
});