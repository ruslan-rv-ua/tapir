/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Active_Recordings_ManyInputs */

const uk_active_recordings_many = /** @type {(inputs: Active_Recordings_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} записів`)
};

const en_active_recordings_many = /** @type {(inputs: Active_Recordings_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} recordings`)
};

/**
* | output |
* | --- |
* | "{count} recordings" |
*
* @param {Active_Recordings_ManyInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const active_recordings_many = /** @type {((inputs: Active_Recordings_ManyInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Active_Recordings_ManyInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_active_recordings_many(inputs)
	return en_active_recordings_many(inputs)
});