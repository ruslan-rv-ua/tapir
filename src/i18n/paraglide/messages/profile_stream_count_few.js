/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Profile_Stream_Count_FewInputs */

const uk_profile_stream_count_few = /** @type {(inputs: Profile_Stream_Count_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} потоки`)
};

const en_profile_stream_count_few = /** @type {(inputs: Profile_Stream_Count_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} streams`)
};

/**
* | output |
* | --- |
* | "{count} streams" |
*
* @param {Profile_Stream_Count_FewInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_stream_count_few = /** @type {((inputs: Profile_Stream_Count_FewInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Stream_Count_FewInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_stream_count_few(inputs)
	return en_profile_stream_count_few(inputs)
});