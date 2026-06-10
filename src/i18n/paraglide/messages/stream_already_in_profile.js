/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown>, profile: NonNullable<unknown> }} Stream_Already_In_ProfileInputs */

const uk_stream_already_in_profile = /** @type {(inputs: Stream_Already_In_ProfileInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`«${i?.name}» вже є в профілі «${i?.profile}»`)
};

const en_stream_already_in_profile = /** @type {(inputs: Stream_Already_In_ProfileInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`“${i?.name}” is already in “${i?.profile}”`)
};

/**
* | output |
* | --- |
* | "“{name}” is already in “{profile}”" |
*
* @param {Stream_Already_In_ProfileInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stream_already_in_profile = /** @type {((inputs: Stream_Already_In_ProfileInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stream_Already_In_ProfileInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stream_already_in_profile(inputs)
	return en_stream_already_in_profile(inputs)
});