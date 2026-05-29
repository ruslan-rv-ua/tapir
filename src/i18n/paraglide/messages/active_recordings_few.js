/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Active_Recordings_FewInputs */

const uk_active_recordings_few = /** @type {(inputs: Active_Recordings_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} записи`)
};

const en_active_recordings_few = /** @type {(inputs: Active_Recordings_FewInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} recordings`)
};

/**
* | output |
* | --- |
* | "{count} recordings" |
*
* @param {Active_Recordings_FewInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const active_recordings_few = /** @type {((inputs: Active_Recordings_FewInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Active_Recordings_FewInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_active_recordings_few(inputs)
	return en_active_recordings_few(inputs)
});