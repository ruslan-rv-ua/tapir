/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ label: NonNullable<unknown>, count: NonNullable<unknown> }} Streams_Filter_Changed_FewInputs */

const uk_streams_filter_changed_few = /** @type {(inputs: Streams_Filter_Changed_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Фільтр «${i?.label}»: ${i?.count} потоки`)
};

const en_streams_filter_changed_few = /** @type {(inputs: Streams_Filter_Changed_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Filter «${i?.label}»: ${i?.count} streams`)
};

/**
* | output |
* | --- |
* | "Filter «{label}»: {count} streams" |
*
* @param {Streams_Filter_Changed_FewInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_filter_changed_few = /** @type {((inputs: Streams_Filter_Changed_FewInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Filter_Changed_FewInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_filter_changed_few(inputs)
	return en_streams_filter_changed_few(inputs)
});