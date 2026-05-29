/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Streams_Search_LabelInputs */

const uk_streams_search_label = /** @type {(inputs: Streams_Search_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Пошук потоків або URL`)
};

const en_streams_search_label = /** @type {(inputs: Streams_Search_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Search streams or URL`)
};

/**
* | output |
* | --- |
* | "Search streams or URL" |
*
* @param {Streams_Search_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const streams_search_label = /** @type {((inputs?: Streams_Search_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Streams_Search_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_streams_search_label(inputs)
	return en_streams_search_label(inputs)
});